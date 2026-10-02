// Schlüssel für gelernte Zuordnungen (merchant_category_mappings) aus einem
// Bankumsatz bilden. Zwei Arten:
// - Händler-Schlüssel ("spotify ab"): Kategorie gilt für alle Umsätze dieses
//   Empfängers.
// - Betrags-Schlüssel ("spotify ab|-9.99"): Händler + vorzeichenrichtiger
//   Betrag. Erkennt wiederkehrende Zahlungen und merkt sich zusätzlich die
//   Beschreibung. Hat beim Nachschlagen Vorrang vor dem Händler-Schlüssel.
//
// Zahlungsdienstleister (PayPal, Klarna, …) stehen als Empfänger für alles
// Mögliche. Für sie wird der echte Händler aus dem Verwendungszweck gelesen
// ("… Ihr Einkauf bei Spotify AB"). Gelingt das nicht, gibt es keinen
// Händler-Schlüssel – nur den Betrags-Schlüssel mit dem Dienstleister-Namen.

const AMOUNT_SEPARATOR = "|";

const PAYMENT_PROVIDER_PATTERN =
  /\b(paypal|klarna|sofort|amazon payments|unzer|mollie|stripe|adyen|ratepay|computop|payone|nexi|mangopay)\b/i;

// Reihenfolge = Priorität. PayPal-Lastschriften: "PP.1234.PP . Spotify AB,
// Ihr Einkauf bei Spotify AB".
const REAL_MERCHANT_PATTERNS = [
  /ihr einkauf bei\s+(.+)/i,
  /\bPP\.\d+\.PP\s*\.?\s*(.+)/i,
  /\b(?:einkauf|bestellung|zahlung) bei\s+(.+)/i,
];

// SEPA-Feldkennungen im Verwendungszweck beenden den Händlernamen.
const SEPA_FIELD_PATTERN =
  /\s(?:EREF|MREF|CRED|SVWZ|ABWA|ABWE|KREF|IBAN|BIC|PURP)[:+]/i;
const MAX_MERCHANT_LENGTH = 80;

function normalizeName(name) {
  return (name || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isPaymentProvider(name) {
  return PAYMENT_PROVIDER_PATTERN.test(name || "");
}

function extractRealMerchant(purpose) {
  for (const pattern of REAL_MERCHANT_PATTERNS) {
    const match = (purpose || "").match(pattern);
    if (!match) {
      continue;
    }
    const name = normalizeName(
      match[1]
        .split(SEPA_FIELD_PATTERN)[0]
        .split(",")[0]
        .replace(/[.;:\s]+$/, "")
    ).slice(0, MAX_MERCHANT_LENGTH);
    if (name && !isPaymentProvider(name)) {
      return name;
    }
  }
  return null;
}

// row: { counterpartyName, purpose, amount } – amount vorzeichenrichtig
// (Ausgabe < 0). Liefert { merchantKey, amountKey } (je null wenn nicht
// bestimmbar).
function merchantKeys({ counterpartyName, purpose, amount }) {
  const name = normalizeName(counterpartyName);
  if (!name) {
    return { merchantKey: null, amountKey: null };
  }
  const merchantKey = isPaymentProvider(name)
    ? extractRealMerchant(purpose)
    : name;
  const signed = Number(amount);
  const amountKey = Number.isFinite(signed)
    ? `${merchantKey || name}${AMOUNT_SEPARATOR}${signed.toFixed(2)}`
    : null;
  return { merchantKey, amountKey };
}

const isAmountKey = (key) => key.includes(AMOUNT_SEPARATOR);

// Gelernte Zuordnung zu einer Zeile suchen: Betrags-Schlüssel vor Händler.
// usable(mapping) entscheidet, ob ein Treffer verwendbar ist (z.B. Umbuchung
// auf das gerade importierte Konto → nicht verwendbar).
function findMapping(mappingByKey, row, usable = () => true) {
  const { merchantKey, amountKey } = merchantKeys(row);
  for (const [key, kind] of [
    [amountKey, "amount"],
    [merchantKey, "merchant"],
  ]) {
    const mapped = key ? mappingByKey.get(key) : null;
    if (mapped && usable(mapped)) {
      return { ...mapped, kind, key };
    }
  }
  return null;
}

// Vorzeichenrichtiger Betrag einer gespeicherten Buchung.
function signedAmount(transaction) {
  const amount = Math.abs(Number(transaction.amount));
  return transaction.type === "expense" ? -amount : amount;
}

// Verwendungszweck einer gespeicherten, importierten Buchung: steht in note
// (lang oder eigene Beschreibung) bzw. sonst in description.
function storedPurpose(transaction) {
  return [transaction.note, transaction.description].filter(Boolean).join(" ");
}

// Eigene Beschreibung (nicht der rohe Bank-Verwendungszweck) oder null.
function customDescription(transaction) {
  const description = (transaction.description || "").trim();
  if (!description) {
    return null;
  }
  if (!transaction.externalRef) {
    return description;
  }
  // Importiert: ohne note ist description der Verwendungszweck; mit note ist
  // sie nur dann eigen, wenn sie nicht aus dem Verwendungszweck stammt.
  const note = transaction.note || "";
  return note && !note.includes(description) ? description : null;
}

module.exports = {
  customDescription,
  extractRealMerchant,
  findMapping,
  isAmountKey,
  isPaymentProvider,
  merchantKeys,
  signedAmount,
  storedPurpose,
};
