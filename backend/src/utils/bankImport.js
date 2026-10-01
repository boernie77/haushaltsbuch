// Bank-Sync-Datei-Import: parst MT940- oder CSV-Exporte aus dem Online-Banking
// (Sparda-Bank Nürnberg bietet CSV/MT940/CAMT.052, ING bietet CSV) in ein
// gemeinsames Format {date, amount, purpose, counterpartyName,
// counterpartyIban}[], damit
// routes/bankSync.js unabhängig vom Ursprungsformat weiterverarbeiten kann.
const mt940js = require("mt940js");
const Papa = require("papaparse");

function isMt940(text) {
  return /^\s*:20:/.test(text);
}

// Beträge aus Bank-/Kreditkarten-CSVs robust lesen. Vorkommende Formate:
// "-12,50", "1.234,56", "1234.56", "1,234.56", "-7,99 €", "€ -7,99",
// "-7,99 EUR", "7,99-" (nachgestelltes Minus), "(7,99)" (Klammern = negativ).
// ⚠️ Vorher wurde "-7,99 €" als -799 gelesen (Währungszeichen verhinderte die
// Komma-Erkennung) → Kreditkarten-Beträge um Faktor 100 falsch.
const CURRENCY = /€|\$|£|\b(?:EUR|USD|GBP|CHF)\b/gi;
const WHITESPACE = /[\s\u00a0\u202f]/g;
const GERMAN_DECIMAL = /,\d{1,2}$/;
const PLAIN_DECIMAL = /\.\d{1,2}$/;
const GERMAN_THOUSANDS_ONLY = /^\d{1,3}(?:\.\d{3})+$/;

function parseGermanOrPlainNumber(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  let text = String(raw).replace(CURRENCY, "").replace(WHITESPACE, "");
  if (!text) {
    return null;
  }
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  let normalized;
  if (GERMAN_DECIMAL.test(text)) {
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (PLAIN_DECIMAL.test(text)) {
    normalized = text.replace(/,/g, "");
  } else if (GERMAN_THOUSANDS_ONLY.test(text)) {
    normalized = text.replace(/\./g, "");
  } else {
    normalized = text.replace(/,/g, "");
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }
  return negative ? -value : value;
}

// Deutsche Banken strukturieren Feld 86 in Unterfelder (?20-?29 = Verwendungs-
// zweck, oft mit Markern wie "SVWZ+"/"EREF+"/"MREF+" davor, ?32/?33 = Name des
// Auftraggebers/Empfängers). mt940js erkennt diese automatisch als
// `structuredDetails` (Objekt {tagNr: value}). Ohne diese Extraktion bleibt
// nur der rohe Tag-Text ("?22SVWZ+...?32...") übrig - unlesbar und ohne
// nutzbaren Empfänger-Namen (der aber für Kategorie-Zuordnung/Lernen
// essenziell ist, siehe routes/bankSync.js).
function extractMt940Purpose(structuredDetails, rawDetails) {
  const parts = [];
  for (let i = 20; i <= 29; i++) {
    const value = structuredDetails?.[String(i)];
    if (value) {
      parts.push(value);
    }
  }
  const joined = parts.join(" ").trim();
  if (!joined) {
    return (rawDetails || "").replace(/\n/g, " ").trim();
  }
  // Häufigster Fall: "SVWZ+eigentlicher Verwendungszweck EREF+... MREF+..."
  // Nur den SVWZ-Teil herausziehen, Rest sind technische Referenzen.
  const svwzMatch = joined.match(
    /SVWZ\+(.*?)(?=(?:EREF\+|MREF\+|CRED\+|KREF\+|ABWA\+|SVWZ\+|$))/i
  );
  return (svwzMatch ? svwzMatch[1] : joined).trim();
}

function extractMt940CounterpartyName(structuredDetails) {
  const parts = ["32", "33"]
    .map((tag) => structuredDetails?.[tag])
    .filter(Boolean);
  return parts.join(" ").trim() || null;
}

// ?31 = Kontonummer/IBAN des Gegenkontos. Nur für IBAN-Regeln genutzt, fließt
// bewusst NICHT in den Dedup-Hash ein (sonst Dubletten bei Altimporten).
function extractMt940CounterpartyIban(structuredDetails) {
  const raw = (structuredDetails?.["31"] || "").replace(/\s/g, "");
  return raw ? raw.toUpperCase() : null;
}

function parseMt940(text) {
  const parser = new mt940js.Parser();
  const statements = parser.parse(text);
  const transactions = [];
  for (const statement of statements) {
    for (const t of statement.transactions) {
      transactions.push({
        date: t.date ? t.date.toISOString().slice(0, 10) : null,
        amount: typeof t.amount === "number" ? t.amount : null,
        purpose: extractMt940Purpose(t.structuredDetails, t.details),
        counterpartyName: extractMt940CounterpartyName(t.structuredDetails),
        counterpartyIban: extractMt940CounterpartyIban(t.structuredDetails),
      });
    }
  }
  return { format: "mt940", transactions };
}

const COLUMN_GUESSES = {
  date: ["buchungstag", "valuta", "datum", "wertstellung", "date"],
  amount: ["betrag", "amount", "umsatz", "betrag (eur)"],
  purpose: [
    "verwendungszweck",
    "buchungstext",
    "beschreibung",
    "purpose",
    "notes",
  ],
  counterpartyName: [
    "empfänger",
    "empfaenger",
    "auftraggeber",
    "name",
    "beguenstigter/zahlungspflichtiger",
    "begünstigter/zahlungspflichtiger",
  ],
  counterpartyIban: [
    "iban",
    "kontonummer/iban",
    "iban auftraggeber",
    "iban empfänger",
    "iban zahlungsbeteiligter",
    "kontonummer",
  ],
};

function guessColumn(headers, candidates) {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lowerHeaders.indexOf(candidate);
    if (idx !== -1) {
      return headers[idx];
    }
  }
  return null;
}

function suggestMapping(headers) {
  return {
    date: guessColumn(headers, COLUMN_GUESSES.date),
    amount: guessColumn(headers, COLUMN_GUESSES.amount),
    purpose: guessColumn(headers, COLUMN_GUESSES.purpose),
    counterpartyName: guessColumn(headers, COLUMN_GUESSES.counterpartyName),
    counterpartyIban: guessColumn(headers, COLUMN_GUESSES.counterpartyIban),
  };
}

function parseCsvPreview(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: "", // auto-detect (Sparda/ING nutzen ; oder ,)
  });
  const headers = parsed.meta.fields || [];
  return {
    format: "csv",
    headers,
    rawRows: parsed.data,
    suggestedMapping: suggestMapping(headers),
  };
}

// Wendet ein bestätigtes Column-Mapping auf CSV-Rohzeilen an.
function applyCsvMapping(rawRows, columnMapping) {
  return rawRows.map((row) => ({
    date: columnMapping.date ? normalizeDate(row[columnMapping.date]) : null,
    amount: columnMapping.amount
      ? parseGermanOrPlainNumber(row[columnMapping.amount])
      : null,
    purpose: columnMapping.purpose
      ? (row[columnMapping.purpose] || "").trim()
      : "",
    counterpartyName: columnMapping.counterpartyName
      ? (row[columnMapping.counterpartyName] || "").trim()
      : null,
    counterpartyIban: columnMapping.counterpartyIban
      ? (row[columnMapping.counterpartyIban] || "")
          .replace(/\s/g, "")
          .toUpperCase() || null
      : null,
  }));
}

// Datumsformate aus Bank-/Kreditkarten-Exporten: DD.MM.YYYY, DD.MM.YY,
// DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD — jeweils auch mit angehängter Uhrzeit.
const DAY_FIRST_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:$|[\sT])/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function normalizeDate(raw) {
  if (!raw) {
    return null;
  }
  const trimmed = String(raw).trim();
  const iso = trimmed.match(ISO_DATE);
  if (iso) {
    return iso[0];
  }
  const dayFirst = trimmed.match(DAY_FIRST_DATE);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return trimmed;
}

module.exports = {
  isMt940,
  parseMt940,
  parseCsvPreview,
  applyCsvMapping,
  parseGermanOrPlainNumber,
  normalizeDate,
};
