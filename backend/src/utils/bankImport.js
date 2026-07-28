// Bank-Sync-Datei-Import: parst MT940- oder CSV-Exporte aus dem Online-Banking
// (Sparda-Bank Nürnberg bietet CSV/MT940/CAMT.052, ING bietet CSV) in ein
// gemeinsames Format {date, amount, purpose, counterpartyName}[], damit
// routes/bankSync.js unabhängig vom Ursprungsformat weiterverarbeiten kann.
const mt940js = require("mt940js");
const Papa = require("papaparse");

function isMt940(text) {
  return /^\s*:20:/.test(text);
}

// Deutsches Zahlenformat ("1.234,56") vs. Standard ("1234.56") erkennen.
function parseGermanOrPlainNumber(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }
  // Enthält Komma als vermutliches Dezimaltrennzeichen (z.B. "1.234,56" oder "-12,50")
  if (/,\d{1,2}$/.test(trimmed)) {
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    return Number.parseFloat(normalized);
  }
  return Number.parseFloat(trimmed.replace(/,/g, ""));
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
        purpose: (t.details || "").replace(/\n/g, " ").trim(),
        counterpartyName: null,
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
  }));
}

// Deutsches Datumsformat (DD.MM.YYYY) und ISO (YYYY-MM-DD) unterstützen.
function normalizeDate(raw) {
  if (!raw) {
    return null;
  }
  const trimmed = String(raw).trim();
  const germanMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0].slice(0, 10);
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
