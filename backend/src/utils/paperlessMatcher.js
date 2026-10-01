// Bank-Sync ↔ Paperless-ngx: sucht zu importierten Bankumsätzen das passende
// Dokument (Rechnung, Beleg) in Paperless. Rechnungen per Mail landen über die
// Mail-Regeln von Paperless ohnehin dort — das Haushaltsbuch sucht nur.
//
// Treffer = Betrag steht im OCR-Text oder in einem Betrags-Custom-Field des
// Dokuments UND das Dokumentdatum liegt im Fenster [Umsatz − 45 Tage,
// Umsatz + 5 Tage] (Rechnungen werden oft erst später bezahlt). Passt
// zusätzlich der Korrespondent zum Empfänger, gilt der Treffer als sicher.
//
// Zweiter, stärkerer Weg: Referenznummern. Steht eine Nummer aus dem
// Verwendungszweck (z.B. Amazon-Bestellnummer 302-1234567-1234567) auch im
// Dokument, ist das ein sicherer Treffer — unabhängig vom Betrag. Wichtig bei
// Amazon: abgebucht wird pro Paket, eine Bestellung kann also mehrere
// Abbuchungen mit Teilbeträgen haben, die alle zur selben Bestellmail gehören.
const { PaperlessCorrespondent } = require("../models");
const { fetchAllPages, getPaperlessClient } = require("./paperlessClient");

const DAYS_BEFORE_PAYMENT = 45;
const DAYS_AFTER_PAYMENT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
// Schutz vor riesigen Zeiträumen (z.B. Jahresexport): mehr Dokumente
// werden nicht geladen, der Abgleich bleibt dann unvollständig.
const MAX_DOCUMENTS = 3000;
const MIN_TOKEN_LENGTH = 3;
const AMOUNT_TOLERANCE = 0.005;
// Monetary Custom Field: "EUR23.80", "23.80" oder "-23.80".
const MONETARY_VALUE = /^(?:[A-Z]{3})?(-?\d+(?:\.\d{1,2})?)$/;
const NON_ALNUM = /[^a-z0-9äöüß]+/g;
// Referenz-Kandidaten im Verwendungszweck: lange Zeichenketten mit vielen
// Ziffern (Bestell-, Rechnungs-, Kundennummern). Kurze Zahlen wie Beträge
// oder Datumsangaben fallen durch.
const REFERENCE_TOKEN = /[A-Za-z0-9][A-Za-z0-9-]{6,}[A-Za-z0-9]/g;
const MIN_REFERENCE_DIGITS = 6;
const DIGIT = /\d/g;
// Referenztreffer schlägt jeden Betrags-/Korrespondententreffer.
const REFERENCE_SCORE = 10;
// Häufige Firmenzusätze, die als Namens-Token nichts aussagen.
const NAME_STOPWORDS = new Set([
  "gmbh",
  "und",
  "der",
  "die",
  "das",
  "co",
  "kg",
  "ag",
  "mbh",
  "sarl",
  "ltd",
  "inc",
  "bank",
  "sagt",
  "danke",
]);

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function daysBetween(a, b) {
  return (
    (new Date(`${a}T00:00:00Z`).getTime() -
      new Date(`${b}T00:00:00Z`).getTime()) /
    MS_PER_DAY
  );
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Regex für einen Betrag in beliebiger Schreibweise: 1234,56 / 1.234,56 /
// 1,234.56 / 1234.56. Darf nicht Teil einer größeren Zahl oder eines Datums
// sein (12.10.2026 ist nicht 12,10 €).
function amountRegex(amount) {
  const cents = Math.round(Math.abs(amount) * 100);
  const integerPart = String(Math.floor(cents / 100));
  const decimals = String(cents % 100).padStart(2, "0");
  const groups = [];
  for (let end = integerPart.length; end > 0; end -= 3) {
    groups.unshift(integerPart.slice(Math.max(0, end - 3), end));
  }
  const integerPattern = groups.map(escapeRegex).join("[.,'\\s]?");
  return new RegExp(
    `(?<![\\d.,])${integerPattern}[.,]${decimals}(?!\\d|[.,]\\d)`
  );
}

function documentDate(doc) {
  const raw = doc.created_date || doc.created || "";
  return typeof raw === "string" ? raw.slice(0, 10) : null;
}

function customFieldAmounts(doc) {
  const amounts = [];
  for (const field of doc.custom_fields || []) {
    const match =
      typeof field?.value === "string"
        ? field.value.match(MONETARY_VALUE)
        : null;
    if (match) {
      amounts.push(Math.abs(Number.parseFloat(match[1])));
    }
  }
  return amounts;
}

function nameTokens(name) {
  return (name || "")
    .toLowerCase()
    .replace(NON_ALNUM, " ")
    .split(" ")
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !NAME_STOPWORDS.has(t));
}

// "Amazon" ↔ "AMAZON EU S.A R.L." → true
function correspondentMatches(correspondentName, row) {
  const tokens = nameTokens(correspondentName);
  if (tokens.length === 0) {
    return false;
  }
  const haystack = ` ${(row.counterpartyName || "").toLowerCase().replace(NON_ALNUM, " ")} ${(row.purpose || "").toLowerCase().replace(NON_ALNUM, " ")} `;
  return tokens.some((t) => haystack.includes(` ${t}`));
}

function referenceTokens(purpose) {
  const tokens = (purpose || "").match(REFERENCE_TOKEN) || [];
  return [
    ...new Set(
      tokens.filter(
        (t) => (t.match(DIGIT) || []).length >= MIN_REFERENCE_DIGITS
      )
    ),
  ];
}

function containsReference(content, references) {
  if (!(content && references.length)) {
    return false;
  }
  return references.some((ref) =>
    new RegExp(`(?<![A-Za-z0-9])${escapeRegex(ref)}(?![A-Za-z0-9])`, "i").test(
      content
    )
  );
}

async function loadDocuments(client, rows) {
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const from = shiftDays(dates[0], -DAYS_BEFORE_PAYMENT);
  const to = shiftDays(dates.at(-1), DAYS_AFTER_PAYMENT);
  const params = new URLSearchParams({
    created__date__gte: from,
    created__date__lte: to,
    page_size: String(PAGE_SIZE),
    ordering: "-created",
    // Ältere Paperless-Versionen ignorieren "fields" und liefern alles.
    fields: "id,title,content,created,created_date,correspondent,custom_fields",
  });
  const docs = await fetchAllPages(
    `${client.baseURL}/api/documents/?${params}`,
    client.headers,
    MAX_DOCUMENTS
  );
  return docs;
}

// Liefert { matches: Map rowIndex → paperlessDoc, error }.
// rows: Bankumsätze; skipIndexes: bereits anderweitig zugeordnete Zeilen.
async function matchPaperlessDocuments({ householdId, rows, skipIndexes }) {
  const matches = new Map();
  const candidateIndexes = rows
    .map((row, i) => i)
    .filter(
      (i) =>
        !skipIndexes.has(i) &&
        rows[i].date &&
        typeof rows[i].amount === "number"
    );
  if (candidateIndexes.length === 0) {
    return { matches, error: null };
  }

  let client;
  try {
    client = await getPaperlessClient(householdId);
  } catch {
    return { matches, error: null }; // Paperless nicht eingerichtet → still.
  }

  let docs;
  try {
    docs = await loadDocuments(
      client,
      candidateIndexes.map((i) => rows[i])
    );
  } catch (err) {
    console.error("[bank-sync] Paperless-Abfrage fehlgeschlagen:", err.message);
    return {
      matches,
      error:
        "Paperless war nicht erreichbar, Dokumente wurden nicht abgeglichen.",
    };
  }

  const correspondents = await PaperlessCorrespondent.findAll({
    where: { householdId },
    attributes: ["paperlessId", "name"],
  });
  const correspondentName = new Map(
    correspondents.map((c) => [c.paperlessId, c.name])
  );

  const candidates = [];
  for (const i of candidateIndexes) {
    const row = rows[i];
    const regex = amountRegex(row.amount);
    const amount = Math.abs(row.amount);
    const references = referenceTokens(row.purpose);
    for (const doc of docs) {
      const docDate = documentDate(doc);
      if (!docDate) {
        continue;
      }
      const offset = daysBetween(docDate, row.date);
      if (offset < -DAYS_BEFORE_PAYMENT || offset > DAYS_AFTER_PAYMENT) {
        continue;
      }
      const inCustomField = customFieldAmounts(doc).some(
        (a) => Math.abs(a - amount) < AMOUNT_TOLERANCE
      );
      const inContent = regex.test(doc.content || "");
      const byReference = containsReference(doc.content, references);
      if (!(inCustomField || inContent || byReference)) {
        continue;
      }
      const corrName = correspondentName.get(doc.correspondent) || null;
      const corrMatch = corrName ? correspondentMatches(corrName, row) : false;
      // Referenznummer zählt am meisten, dann Korrespondent, dann
      // strukturierter Betrag, dann zeitliche Nähe.
      const score =
        (byReference ? REFERENCE_SCORE : 0) +
        (corrMatch ? 2 : 0) +
        (inCustomField ? 1 : 0) -
        Math.abs(offset) / 100;
      candidates.push({
        index: i,
        doc,
        corrName,
        corrMatch,
        byReference,
        docDate,
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const usedDocs = new Set();
  for (const c of candidates) {
    // Über Referenznummer darf ein Dokument mehrere Abbuchungen bekommen
    // (Teillieferungen), über den Betrag nur eine.
    if (matches.has(c.index) || (!c.byReference && usedDocs.has(c.doc.id))) {
      continue;
    }
    usedDocs.add(c.doc.id);
    matches.set(c.index, {
      id: c.doc.id,
      title: c.doc.title || `Dokument ${c.doc.id}`,
      correspondent: c.corrName,
      date: c.docDate,
      url: `${client.baseURL}/documents/${c.doc.id}/details`,
      confidence: c.corrMatch || c.byReference ? "high" : "low",
      byReference: c.byReference,
    });
  }
  return { matches, error: null };
}

module.exports = {
  amountRegex,
  correspondentMatches,
  matchPaperlessDocuments,
  referenceTokens,
};
