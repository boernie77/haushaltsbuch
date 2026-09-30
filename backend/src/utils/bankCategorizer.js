// Automatische Zuordnung von Kategorie + Beschreibung für Bank-Sync-Importe.
// Reihenfolge der Quellen (erste Quelle mit Treffer gewinnt, siehe
// routes/bankSync.js /preview):
//   1. Schnellerfassung (pendingBankMatch-Buchung mit gleichem Betrag, Datum
//      im Abgleichfenster) → wird beim Import mit dem Bankumsatz verschmolzen
//   2. Regeln (bank_categorization_rules, vom User gepflegt)
//   3. Gelerntes Merchant-Mapping (merchant_category_mappings)
//   4. KI-Vorschlag (Claude, pro Haushaltsbuch opt-in)
const { Op } = require("sequelize");
const { Transaction, Category } = require("../models");

// Kartenzahlungen werden oft erst 1-3 Tage nach dem Kauf gebucht; ±5 Tage
// deckt auch Wochenenden/Feiertage ab.
const QUICK_ENTRY_MATCH_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.01;
// Pro KI-Aufruf maximal so viele Umsätze, damit die Antwort sicher in
// max_tokens passt. Größere Importe werden in mehrere Aufrufe aufgeteilt.
const AI_CHUNK_SIZE = 100;
const AI_MAX_TOKENS = 16_000;
const DESCRIPTION_MAX_LENGTH = 255;

const AI_MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (günstig, schnell)" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (genauer)" },
  { id: "claude-opus-5-5", label: "Opus 5.5 (am genauesten, teuer)" },
];
const DEFAULT_AI_MODEL = "claude-haiku-4-5";
// Diese Modelle unterstützen serverseitige Refusal-Fallbacks und effort.
const MODELS_WITH_EFFORT = new Set(["claude-sonnet-5-5", "claude-opus-5-5"]);

function txType(amount) {
  return amount < 0 ? "expense" : "income";
}

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / MS_PER_DAY;
}

// ── 1. Schnellerfassungen ────────────────────────────────────────────────────

// Lädt alle offenen Schnellerfassungen im Zeitraum der Datei (± Fenster).
// Schnellerfassungen kommen vom Handy und haben i.d.R. kein Konto → auch
// accountId NULL zulassen.
function loadPendingQuickEntries(householdId, accountId, rows) {
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) {
    return [];
  }
  const from = new Date(dates[0]);
  from.setDate(from.getDate() - QUICK_ENTRY_MATCH_DAYS);
  const to = new Date(dates.at(-1));
  to.setDate(to.getDate() + QUICK_ENTRY_MATCH_DAYS);
  return Transaction.findAll({
    where: {
      householdId,
      pendingBankMatch: true,
      [Op.or]: [{ accountId: null }, { accountId }],
      date: { [Op.between]: [from, to] },
    },
    include: [
      {
        model: Category,
        attributes: ["id", "name", "nameDE", "icon", "color"],
      },
    ],
    order: [["date", "ASC"]],
  });
}

// Ordnet jeder Bankzeile höchstens eine Schnellerfassung zu und umgekehrt.
// Bei mehreren Kandidaten gewinnt der mit dem geringsten Datumsabstand.
function matchQuickEntries(rows, quickEntries, skipIndexes) {
  const candidates = [];
  rows.forEach((row, index) => {
    if (skipIndexes.has(index) || !row.date || typeof row.amount !== "number") {
      return;
    }
    const amount = Math.abs(row.amount);
    for (const entry of quickEntries) {
      const sameType = entry.type === txType(row.amount);
      const sameAmount =
        Math.abs(Number(entry.amount) - amount) <= AMOUNT_TOLERANCE;
      const distance = daysBetween(entry.date, row.date);
      if (sameType && sameAmount && distance <= QUICK_ENTRY_MATCH_DAYS) {
        candidates.push({ index, entry, distance });
      }
    }
  });
  candidates.sort((a, b) => a.distance - b.distance);

  const matches = new Map();
  const usedEntries = new Set();
  for (const { index, entry } of candidates) {
    if (matches.has(index) || usedEntries.has(entry.id)) {
      continue;
    }
    matches.set(index, entry);
    usedEntries.add(entry.id);
  }
  return { matches, usedEntryIds: usedEntries };
}

// ── 2. Regeln ────────────────────────────────────────────────────────────────

function ruleFieldValues(rule, row) {
  const counterparty = row.counterpartyName || "";
  const purpose = row.purpose || "";
  const iban = (row.counterpartyIban || "").replace(/\s/g, "");
  if (rule.field === "counterparty") {
    return [counterparty];
  }
  if (rule.field === "purpose") {
    return [purpose];
  }
  if (rule.field === "iban") {
    return [iban];
  }
  return [counterparty, purpose, iban];
}

function ruleMatches(rule, row) {
  const pattern =
    rule.field === "iban"
      ? rule.pattern.replace(/\s/g, "").toLowerCase()
      : rule.pattern.trim().toLowerCase();
  if (!pattern) {
    return false;
  }
  const textMatches = ruleFieldValues(rule, row).some((v) =>
    v.toLowerCase().includes(pattern)
  );
  if (!textMatches) {
    return false;
  }
  const amount = Math.abs(row.amount ?? 0);
  const aboveMin = rule.minAmount === null || amount >= Number(rule.minAmount);
  const belowMax = rule.maxAmount === null || amount <= Number(rule.maxAmount);
  return aboveMin && belowMax;
}

function findMatchingRule(rules, row) {
  return rules.find((rule) => ruleMatches(rule, row)) || null;
}

// ── 4. KI ────────────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `Du ordnest Kontoumsätze aus einem deutschen Haushaltsbuch Kategorien zu.

Du bekommst eine Liste von Kategorien (Schlüssel + Name) und eine Liste von Umsätzen (Index, Betrag, Richtung, Empfänger/Auftraggeber, Verwendungszweck). Wähle für jeden Umsatz die passendste Kategorie anhand des Empfängers und des Verwendungszwecks. Negative Beträge sind Ausgaben, positive Einnahmen.

Setze confidence auf "high", wenn die Zuordnung eindeutig ist (z. B. bekannter Supermarkt, Tankstelle, Versicherung). Setze sie auf "low", wenn du raten musst, etwa bei Überweisungen an Privatpersonen oder nichtssagenden Verwendungszwecken. Wenn keine Kategorie sinnvoll passt, setze category auf null.

Die Beschreibung ist ein kurzer deutscher Oberbegriff mit 1-4 Wörtern, z. B. "Lebensmitteleinkauf", "Tankfüllung", "Handyvertrag", "Gehalt". Wiederhole dort nicht den Händlernamen und übernimm keine Referenznummern.

Gib für jeden Umsatz aus der Eingabe genau einen Eintrag zurück.`;

function buildAiSchema(categoryKeys) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["suggestions"],
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "category", "description", "confidence"],
          properties: {
            index: { type: "integer" },
            category: {
              anyOf: [{ type: "string", enum: categoryKeys }, { type: "null" }],
            },
            description: { type: "string" },
            confidence: { type: "string", enum: ["high", "low"] },
          },
        },
      },
    },
  };
}

async function requestAiChunk({ client, model, categoryList, items, schema }) {
  const params = {
    model,
    max_tokens: AI_MAX_TOKENS,
    system: AI_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Kategorien:\n${JSON.stringify(categoryList)}\n\nUmsätze:\n${JSON.stringify(items)}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema } },
  };
  const options = {};
  if (MODELS_WITH_EFFORT.has(model)) {
    // Einfache Klassifikation → wenig Denkaufwand reicht.
    params.output_config.effort = "low";
    // Serverseitiger Fallback, falls ein Sicherheitsfilter fälschlich greift.
    params.fallbacks = "default";
    options.headers = { "anthropic-beta": "server-side-fallback-2026-07-01" };
  }

  const response = await client.messages.create(params, options);
  if (response.stop_reason === "refusal") {
    console.warn("[bank-sync] KI hat die Zuordnung abgelehnt");
    return [];
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    return [];
  }
  try {
    return JSON.parse(textBlock.text).suggestions || [];
  } catch {
    // Bei stop_reason "max_tokens" kann das JSON abgeschnitten sein.
    console.warn(
      `[bank-sync] KI-Antwort nicht lesbar (stop_reason=${response.stop_reason})`
    );
    return [];
  }
}

// Liefert Map rowIndex → { categoryId, description, confidence }.
// Sendet bewusst nur Betrag, Empfängername und Verwendungszweck — keine
// IBAN, kein Kontostand, kein Kontoname.
async function suggestWithAi({ apiKey, model, categories, rows, indexes }) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const effectiveModel = AI_MODELS.some((m) => m.id === model)
    ? model
    : DEFAULT_AI_MODEL;

  const keyToCategoryId = new Map();
  const categoryList = categories.map((c, i) => {
    const key = `c${i + 1}`;
    keyToCategoryId.set(key, c.id);
    return { key, name: c.nameDE || c.name };
  });
  const schema = buildAiSchema([...keyToCategoryId.keys()]);

  const result = new Map();
  for (let start = 0; start < indexes.length; start += AI_CHUNK_SIZE) {
    const chunk = indexes.slice(start, start + AI_CHUNK_SIZE);
    const items = chunk.map((index) => ({
      index,
      amount: rows[index].amount,
      counterparty: rows[index].counterpartyName || "",
      purpose: (rows[index].purpose || "").slice(0, 300),
    }));
    // eslint-disable-next-line no-await-in-loop
    const suggestions = await requestAiChunk({
      client,
      model: effectiveModel,
      categoryList,
      items,
      schema,
    });
    const allowed = new Set(chunk);
    for (const s of suggestions) {
      if (!allowed.has(s.index)) {
        continue;
      }
      result.set(s.index, {
        categoryId: s.category ? keyToCategoryId.get(s.category) || null : null,
        description: (s.description || "")
          .trim()
          .slice(0, DESCRIPTION_MAX_LENGTH),
        confidence: s.confidence === "high" ? "high" : "low",
      });
    }
  }
  return result;
}

module.exports = {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  QUICK_ENTRY_MATCH_DAYS,
  findMatchingRule,
  loadPendingQuickEntries,
  matchQuickEntries,
  suggestWithAi,
  txType,
};
