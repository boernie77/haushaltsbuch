// Automatische Zuordnung von Kategorie + Beschreibung für Bank-Sync-Importe.
// Reihenfolge der Quellen (erste Quelle mit Treffer gewinnt, siehe
// routes/bankSync.js /preview):
//   1. Vorhandene Buchung (Schnellerfassung, von Hand erfasst oder aus
//      Dauerauftrag; gleicher Betrag, Datum im Abgleichfenster, bei
//      Sub-Konto-Kategorien wie Spesen auch Wochen später) → wird beim
//      Import mit dem Bankumsatz verschmolzen, Bankdatum gilt
//   2. Regeln (bank_categorization_rules, vom User gepflegt)
//   3. Gelerntes Merchant-Mapping (merchant_category_mappings)
//   4. KI-Vorschlag (pro Haushaltsbuch opt-in): Claude ODER ein eigener
//      KI-Server mit OpenAI-kompatibler Schnittstelle (Ollama, LM Studio,
//      vLLM, llama.cpp-Server, …)
const { Op } = require("sequelize");
const { Transaction, Category } = require("../models");

// Kartenzahlungen werden oft erst 1-3 Tage nach dem Kauf gebucht; ±5 Tage
// deckt auch Wochenenden/Feiertage ab.
const QUICK_ENTRY_MATCH_DAYS = 5;
const RECURRING_MATCH_DAYS = 7;
const MAX_MATCH_DAYS = Math.max(QUICK_ENTRY_MATCH_DAYS, RECURRING_MATCH_DAYS);
// Späte Abbuchung: Sub-Konto-Kategorien (z.B. Spesen) werden oft erst Wochen
// nach der Erfassung abgebucht (Hotelrechnung mit Zahlungsziel, PayPal,
// Klarna). Pro Haushaltsbuch je Kategorie einstellbar (households.
// "bankSyncLateMatchDays"), ohne Eintrag gilt für Sub-Konto-Kategorien 45.
const SUB_ACCOUNT_LATE_MATCH_DAYS = 45;
const MAX_LATE_MATCH_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.01;
// Pro KI-Aufruf maximal so viele Umsätze, damit die Antwort sicher in
// max_tokens passt. Größere Importe werden in mehrere Aufrufe aufgeteilt.
// Lokale Modelle sind kleiner und langsamer → kleinere Portionen, damit
// sie nicht den Überblick verlieren und einzelne Aufrufe nicht ewig laufen.
const AI_CHUNK_SIZE = 100;
const LOCAL_AI_CHUNK_SIZE = 25;
const AI_MAX_TOKENS = 16_000;
// Lokale Server auf schwacher Hardware brauchen u.U. Minuten pro Portion.
const LOCAL_AI_TIMEOUT_MS = 5 * 60 * 1000;
const LOCAL_AI_LIST_TIMEOUT_MS = 10 * 1000;
const PURPOSE_MAX_LENGTH = 300;

const AI_PROVIDERS = {
  anthropic: "anthropic",
  openaiCompatible: "openai_compatible",
};
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

// Tage von a nach b (positiv, wenn b später liegt).
function signedDaysBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY;
}

// ── 1. Vorhandene Buchungen (Schnellerfassung, von Hand, Dauerauftrag) ─────

// Datumsfenster je Art der vorhandenen Buchung. Daueraufträge werden bei
// Wochenende/Feiertag oft mehrere Tage verschoben abgebucht.
function matchWindowDays(entry) {
  return entry.recurringSourceId
    ? RECURRING_MATCH_DAYS
    : QUICK_ENTRY_MATCH_DAYS;
}

// Liest households."bankSyncLateMatchDays" → { categoryId: Tage }. Ungültige
// Einträge werden ignoriert.
function parseLateMatchDays(raw) {
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  const result = {};
  for (const [categoryId, days] of Object.entries(parsed || {})) {
    const n = Number.parseInt(days, 10);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_LATE_MATCH_DAYS) {
      result[categoryId] = n;
    }
  }
  return result;
}

// Wie viele Tage nach der Buchung die Abbuchung noch kommen darf. 0 = kein
// spätes Fenster (es gilt das normale ±5/±7-Tage-Fenster).
function lateMatchDaysFor(category, lateMatchDays = {}) {
  if (!category) {
    return 0;
  }
  if (Object.hasOwn(lateMatchDays, category.id)) {
    return lateMatchDays[category.id];
  }
  return category.hasSubAccount ? SUB_ACCOUNT_LATE_MATCH_DAYS : 0;
}

// Größtes späte Fenster, das in diesem Haushaltsbuch vorkommen kann (für das
// Laden der Kandidaten).
function maxLateMatchDays(lateMatchDays = {}) {
  return Math.max(SUB_ACCOUNT_LATE_MATCH_DAYS, ...Object.values(lateMatchDays));
}

// Abgleichfenster einer vorhandenen Buchung in Tagen relativ zum Bankdatum:
// Abbuchung bis `before` Tage vor und `after` Tage nach der Buchung. Das
// späte Fenster gilt nur nach vorne — bezahlt wird nach der Rechnung.
function matchWindow(entry, lateMatchDays) {
  const base = matchWindowDays(entry);
  const late =
    entry.type === "transfer"
      ? 0
      : lateMatchDaysFor(entry.Category, lateMatchDays);
  return { before: base, after: Math.max(base, late), base };
}

// Lädt alle Buchungen, die zu einem Bankumsatz der Datei gehören könnten
// (keine Dauerauftrags-Vorlagen):
// - Ausgabe/Einnahme, noch nicht mit der Bank verknüpft (externalRef NULL),
//   gleiches Konto oder ohne Konto (App-Buchungen haben keins)
// - Umbuchung VON diesem Konto, Quell-Seite noch nicht verknüpft
// - Umbuchung AUF dieses Konto, Ziel-Seite noch nicht verknüpft
//   (transferExternalRef NULL) — die Quell-Seite darf schon importiert sein
// lateMatchDays: { categoryId: Tage } (siehe parseLateMatchDays) — bestimmt,
// wie weit vor dem ersten Umsatz der Datei noch gesucht wird.
function loadMatchCandidates(householdId, accountId, rows, lateMatchDays = {}) {
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) {
    return [];
  }
  const from = new Date(dates[0]);
  from.setDate(
    from.getDate() - Math.max(MAX_MATCH_DAYS, maxLateMatchDays(lateMatchDays))
  );
  const to = new Date(dates.at(-1));
  to.setDate(to.getDate() + MAX_MATCH_DAYS);
  return Transaction.findAll({
    where: {
      householdId,
      isRecurring: { [Op.ne]: true },
      isSubAccountSettlement: { [Op.ne]: true },
      date: { [Op.between]: [from, to] },
      [Op.or]: [
        {
          type: { [Op.in]: ["expense", "income"] },
          externalRef: null,
          [Op.or]: [{ accountId: null }, { accountId }],
        },
        { type: "transfer", externalRef: null, accountId },
        {
          type: "transfer",
          transferExternalRef: null,
          transferTargetAccountId: accountId,
        },
      ],
    },
    include: [
      {
        model: Category,
        attributes: ["id", "name", "nameDE", "icon", "color", "hasSubAccount"],
      },
    ],
    order: [["date", "ASC"]],
  });
}

// Aus Sicht des importierten Kontos: geht bei dieser Buchung Geld ab ("out")
// oder kommt es an ("in")? null = Buchung passt zu keiner Seite.
function entrySide(entry, accountId) {
  if (entry.type !== "transfer") {
    return entry.type === "expense" ? "out" : "in";
  }
  if (entry.accountId === accountId && !entry.externalRef) {
    return "out";
  }
  if (
    entry.transferTargetAccountId === accountId &&
    !entry.transferExternalRef
  ) {
    return "in";
  }
  return null;
}

// Ordnet jeder Bankzeile höchstens eine vorhandene Buchung zu und umgekehrt.
// Bei mehreren Kandidaten gewinnt der mit dem geringsten Datumsabstand.
// Liefert Map rowIndex → { entry, distance (Tage), late (außerhalb des
// normalen Fensters, nur über "späte Abbuchung" gefunden) }.
function matchExistingEntries(
  rows,
  entries,
  skipIndexes,
  accountId,
  lateMatchDays = {}
) {
  const candidates = [];
  rows.forEach((row, index) => {
    if (skipIndexes.has(index) || !row.date || typeof row.amount !== "number") {
      return;
    }
    const amount = Math.abs(row.amount);
    for (const entry of entries) {
      const rowSide = row.amount < 0 ? "out" : "in";
      const sameType = entrySide(entry, accountId) === rowSide;
      const sameAmount =
        Math.abs(Number(entry.amount) - amount) <= AMOUNT_TOLERANCE;
      // > 0: Abbuchung nach der Buchung.
      const offset = signedDaysBetween(entry.date, row.date);
      const window = matchWindow(entry, lateMatchDays);
      const inWindow = offset >= -window.before && offset <= window.after;
      if (sameType && sameAmount && inWindow) {
        candidates.push({
          index,
          entry,
          distance: Math.abs(offset),
          late: Math.abs(offset) > window.base,
        });
      }
    }
  });
  candidates.sort((a, b) => a.distance - b.distance);

  const matches = new Map();
  const usedEntries = new Set();
  for (const { index, entry, distance, late } of candidates) {
    if (matches.has(index) || usedEntries.has(entry.id)) {
      continue;
    }
    matches.set(index, { entry, distance: Math.round(distance), late });
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

Du bekommst eine Liste von Kategorien (Schlüssel + Name) und eine Liste von Umsätzen (Index, Betrag, Empfänger/Auftraggeber, Verwendungszweck). Wähle für jeden Umsatz die passendste Kategorie anhand des Empfängers und des Verwendungszwecks. Negative Beträge sind Ausgaben, positive Einnahmen.

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

function buildUserMessage(categoryList, items) {
  return `Kategorien:\n${JSON.stringify(categoryList)}\n\nUmsätze:\n${JSON.stringify(items)}`;
}

// Lokale Modelle verpacken JSON gern in ```-Blöcke oder schreiben vorher
// <think>…</think> (Reasoning-Modelle). Robust das äußerste Objekt suchen.
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
function parseSuggestionsJson(text) {
  const cleaned = (text || "").replace(THINK_BLOCK, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : null;
  } catch {
    return null;
  }
}

// ── 4a. Claude ───────────────────────────────────────────────────────────────

function createAnthropicRequester({ apiKey, model }) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const effectiveModel = AI_MODELS.some((m) => m.id === model)
    ? model
    : DEFAULT_AI_MODEL;

  return async ({ categoryList, items, schema }) => {
    const params = {
      model: effectiveModel,
      max_tokens: AI_MAX_TOKENS,
      system: AI_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserMessage(categoryList, items) },
      ],
      output_config: { format: { type: "json_schema", schema } },
    };
    const options = {};
    if (MODELS_WITH_EFFORT.has(effectiveModel)) {
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
    const suggestions = parseSuggestionsJson(textBlock?.text);
    if (!suggestions) {
      // Bei stop_reason "max_tokens" kann das JSON abgeschnitten sein.
      console.warn(
        `[bank-sync] KI-Antwort nicht lesbar (stop_reason=${response.stop_reason})`
      );
    }
    return suggestions || [];
  };
}

// ── 4b. Eigener KI-Server (OpenAI-kompatibel) ────────────────────────────────

// Nimmt die vom User eingetragene Basis-URL entgegen. Erlaubt nur http(s).
// Ohne Pfad wird "/v1" ergänzt (Standard bei Ollama, LM Studio, vLLM).
// Gibt null zurück, wenn die URL unbrauchbar ist.
function normalizeLocalUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/v1";
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function localHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

// Fehlertext ohne Antwort-Body: die URL kann auf beliebige Server zeigen,
// deren Antworten wir nicht an den Browser durchreichen wollen.
function localHttpError(response) {
  return new Error(
    `KI-Server antwortet mit HTTP ${response.status}. URL, Modellname und ggf. API-Key prüfen.`
  );
}

function localNetworkError(err) {
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return new Error(
      "KI-Server hat nicht rechtzeitig geantwortet. Ist das Modell zu groß für die Hardware?"
    );
  }
  return new Error(
    "KI-Server nicht erreichbar. Läuft er, und ist er vom Haushaltsbuch-Server aus erreichbar?"
  );
}

// GET {baseUrl}/models → Liste der Modellnamen (zum Testen der Verbindung
// und als Auswahlhilfe in den Einstellungen).
async function listLocalModels({ baseUrl, apiKey }) {
  let response;
  try {
    response = await fetch(`${baseUrl}/models`, {
      headers: localHeaders(apiKey),
      redirect: "error",
      signal: AbortSignal.timeout(LOCAL_AI_LIST_TIMEOUT_MS),
    });
  } catch (err) {
    throw localNetworkError(err);
  }
  if (!response.ok) {
    throw localHttpError(response);
  }
  const data = await response.json().catch(() => null);
  return (data?.data || [])
    .map((m) => m?.id)
    .filter((id) => typeof id === "string")
    .sort();
}

async function postChatCompletion({ baseUrl, apiKey, body }) {
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: localHeaders(apiKey),
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(LOCAL_AI_TIMEOUT_MS),
    });
  } catch (err) {
    throw localNetworkError(err);
  }
}

function createLocalRequester({ baseUrl, apiKey, model }) {
  return async ({ categoryList, items, schema }) => {
    const body = {
      model,
      temperature: 0,
      stream: false,
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(categoryList, items) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "bank_suggestions", strict: true, schema },
      },
    };
    let response = await postChatCompletion({ baseUrl, apiKey, body });
    // Ältere Server kennen json_schema nicht → einmal ohne Vorgabe versuchen
    // (Prompt verlangt trotzdem JSON, parseSuggestionsJson ist tolerant).
    if (response.status === 400 || response.status === 422) {
      const { response_format: _unused, ...plainBody } = body;
      response = await postChatCompletion({
        baseUrl,
        apiKey,
        body: plainBody,
      });
    }
    if (!response.ok) {
      throw localHttpError(response);
    }
    const data = await response.json().catch(() => null);
    const suggestions = parseSuggestionsJson(
      data?.choices?.[0]?.message?.content
    );
    if (!suggestions) {
      console.warn("[bank-sync] Antwort des KI-Servers nicht lesbar");
    }
    return suggestions || [];
  };
}

// ── 4c. Gemeinsamer Ablauf ───────────────────────────────────────────────────

// Liefert Map rowIndex → { categoryId, description, confidence }.
// Sendet bewusst nur Betrag, Empfängername und Verwendungszweck — keine
// IBAN, kein Kontostand, kein Kontoname.
// config: { provider: "anthropic", apiKey, model }
//      | { provider: "openai_compatible", baseUrl, apiKey?, model }
async function suggestWithAi({ config, categories, rows, indexes }) {
  const isLocal = config.provider === AI_PROVIDERS.openaiCompatible;
  const request = isLocal
    ? createLocalRequester(config)
    : createAnthropicRequester(config);
  const chunkSize = isLocal ? LOCAL_AI_CHUNK_SIZE : AI_CHUNK_SIZE;

  const keyToCategoryId = new Map();
  const categoryList = categories.map((c, i) => {
    const key = `c${i + 1}`;
    keyToCategoryId.set(key, c.id);
    return { key, name: c.nameDE || c.name };
  });
  const schema = buildAiSchema([...keyToCategoryId.keys()]);

  const result = new Map();
  for (let start = 0; start < indexes.length; start += chunkSize) {
    const chunk = indexes.slice(start, start + chunkSize);
    const items = chunk.map((index) => ({
      index,
      amount: rows[index].amount,
      counterparty: rows[index].counterpartyName || "",
      purpose: (rows[index].purpose || "").slice(0, PURPOSE_MAX_LENGTH),
    }));
    // eslint-disable-next-line no-await-in-loop
    const suggestions = await request({ categoryList, items, schema });
    const allowed = new Set(chunk);
    for (const s of suggestions) {
      // Kleine Modelle halten sich nicht immer ans Schema → alles prüfen.
      if (!(s && allowed.has(s.index))) {
        continue;
      }
      result.set(s.index, {
        categoryId:
          typeof s.category === "string"
            ? keyToCategoryId.get(s.category) || null
            : null,
        description:
          typeof s.description === "string"
            ? s.description.trim().slice(0, DESCRIPTION_MAX_LENGTH)
            : "",
        confidence: s.confidence === "high" ? "high" : "low",
      });
    }
  }
  return result;
}

module.exports = {
  AI_MODELS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  listLocalModels,
  normalizeLocalUrl,
  AMOUNT_TOLERANCE,
  MAX_LATE_MATCH_DAYS,
  QUICK_ENTRY_MATCH_DAYS,
  SUB_ACCOUNT_LATE_MATCH_DAYS,
  findMatchingRule,
  lateMatchDaysFor,
  parseLateMatchDays,
  entrySide,
  loadMatchCandidates,
  matchExistingEntries,
  suggestWithAi,
  txType,
};
