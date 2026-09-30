// Bank-Sync-Feature: manueller CSV/MT940-Datei-Import (kein Live-FinTS-Zugang
// nötig). User exportiert Umsätze aus dem Online-Banking (Sparda-Bank Nürnberg
// bietet CSV/MT940/CAMT.052, ING bietet CSV) und lädt die Datei hier hoch.
const crypto = require("node:crypto");
const router = require("express").Router();
const multer = require("multer");
const { Op } = require("sequelize");
const {
  BankCategorizationRule,
  BankImportProfile,
  Category,
  Household,
  HouseholdMember,
  PaperlessConfig,
  Transaction,
  MerchantCategoryMapping,
} = require("../models");
const { auth } = require("../middleware/auth");
const { resolveApiKey } = require("../utils/anthropicKey");
const {
  AI_MODELS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL,
  findMatchingRule,
  listLocalModels,
  normalizeLocalUrl,
  loadPendingQuickEntries,
  matchQuickEntries,
  suggestWithAi,
  txType,
} = require("../utils/bankCategorizer");
const {
  isMt940,
  parseMt940,
  parseCsvPreview,
  applyCsvMapping,
} = require("../utils/bankImport");
const { getPeriodForDate } = require("../utils/monthBounds");
const { matchPaperlessDocuments } = require("../utils/paperlessMatcher");

const TEXT_MAX_LENGTH = 255;
// Quellen, aus denen beim Import ein Merchant→Kategorie-Mapping gelernt
// wird. Regeln + bestehende Mappings nicht (wären nur Wiederholung).
const LEARNING_SOURCES = new Set(["quick", "ai", "manual"]);

// Kleine Textdateien, nur zum Parsen - keine Disk-Persistenz nötig.
const upload = multer({ storage: multer.memoryStorage() });

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// Schreibzugriff (Einstellungen, Regeln): alle außer Betrachter.
async function checkWriteAccess(userId, householdId) {
  const member = await checkAccess(userId, householdId);
  return member && member.role !== "viewer" ? member : null;
}

// Admin des Haushaltsbuchs: nötig für die Adresse eines eigenen KI-Servers,
// weil der Haushaltsbuch-Server diese Adresse selbst aufruft.
async function checkAdminAccess(userId, householdId) {
  const member = await checkAccess(userId, householdId);
  return member?.role === "admin" ? member : null;
}

// Ermittelt die KI-Konfiguration für den Import. Gibt {config} oder {error}.
async function resolveAiConfig(household, userId) {
  if (household.bankSyncAiProvider === AI_PROVIDERS.openaiCompatible) {
    const baseUrl = normalizeLocalUrl(household.bankSyncLocalUrl);
    if (!(baseUrl && household.bankSyncLocalModel)) {
      return {
        error:
          "Eigener KI-Server ist nicht vollständig eingerichtet (Adresse und Modell unter Zuordnung & KI eintragen).",
      };
    }
    return {
      config: {
        provider: AI_PROVIDERS.openaiCompatible,
        baseUrl,
        apiKey: household.bankSyncLocalApiKey || null,
        model: household.bankSyncLocalModel,
      },
    };
  }
  const apiKey = await resolveApiKey(household.id, userId);
  if (!apiKey) {
    return {
      error:
        "Kein Anthropic-API-Key verfügbar. Bitte unter Haushalt → KI-Einstellungen hinterlegen.",
    };
  }
  return {
    config: {
      provider: AI_PROVIDERS.anthropic,
      apiKey,
      model: household.bankSyncAiModel,
    },
  };
}

// System-Kategorien + eigene Kategorien des Haushaltsbuchs.
function loadCategories(householdId) {
  return Category.findAll({
    where: {
      [Op.or]: [{ householdId }, { householdId: null, isSystem: true }],
    },
    order: [
      ["sortOrder", "ASC"],
      ["name", "ASC"],
    ],
  });
}

function loadRules(householdId) {
  return BankCategorizationRule.findAll({
    where: { householdId },
    order: [
      ["sortOrder", "ASC"],
      ["createdAt", "ASC"],
    ],
  });
}

function quickEntryJson(entry) {
  return {
    id: entry.id,
    date: entry.date,
    amount: Number(entry.amount),
    type: entry.type,
    description: entry.description,
    note: entry.note,
    Category: entry.Category || null,
  };
}

// Dedup-Schlüssel: Hash aus Datum + Betrag + Verwendungszweck + Gegenkonto.
// Wiederholte Importe (z.B. überlappender Exportzeitraum) legen dieselbe
// Buchung nicht doppelt an.
function computeExternalRef(tx) {
  const raw = [tx.date, tx.amount, tx.purpose, tx.counterpartyName]
    .map((v) => (v ?? "").toString().trim().toLowerCase())
    .join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Erkennt exakt bereits importierte Buchungen (gleicher externalRef).
async function isExactDuplicate(accountId, tx) {
  if (tx.amount === null || tx.amount === undefined) {
    return false;
  }
  const exists = await Transaction.findOne({
    where: { accountId, externalRef: computeExternalRef(tx) },
  });
  return !!exists;
}

// Fuzzy-Abgleich gegen ALLE Buchungen des Kontos (auch manuell erfasste, die
// keinen externalRef haben): Datum ±3 Tage + Betrag ±0.01 + gleicher Typ.
// Erkennt keine exakte Übereinstimmung, sondern nur "vermutlich schon erfasst"
// — wird im Frontend als Warnung angezeigt, blockt den Import aber nicht.
async function findPossibleManualDuplicate(householdId, accountId, tx) {
  if (!(tx.date && typeof tx.amount === "number")) {
    return false;
  }
  const checkDate = new Date(tx.date);
  const from = new Date(checkDate);
  from.setDate(from.getDate() - 3);
  const to = new Date(checkDate);
  to.setDate(to.getDate() + 3);
  const amount = Math.abs(tx.amount);
  const candidate = await Transaction.findOne({
    where: {
      householdId,
      accountId,
      isRecurring: { [Op.ne]: true },
      type: tx.amount < 0 ? "expense" : "income",
      amount: { [Op.between]: [amount - 0.01, amount + 0.01] },
      date: { [Op.between]: [from, to] },
      // Offene Schnellerfassungen sind kein Duplikat, sondern werden beim
      // Import gezielt verschmolzen (siehe suggestion.source === "quick").
      pendingBankMatch: false,
    },
  });
  return !!candidate;
}

// Vorschlag aus KI holen. Fehler (kein Key, API down) brechen die Vorschau
// nicht ab, sondern werden als aiStatus.error ans Frontend gemeldet.
async function applyAiSuggestions({
  household,
  userId,
  categories,
  rows,
  pendingIndexes,
  suggestions,
}) {
  const aiStatus = {
    enabled: household.bankSyncAiEnabled,
    requested: 0,
    error: null,
  };
  if (!household.bankSyncAiEnabled || pendingIndexes.length === 0) {
    return aiStatus;
  }
  const { config, error } = await resolveAiConfig(household, userId);
  if (error) {
    aiStatus.error = error;
    return aiStatus;
  }
  aiStatus.requested = pendingIndexes.length;
  try {
    const aiResult = await suggestWithAi({
      config,
      categories,
      rows,
      indexes: pendingIndexes,
    });
    for (const [index, ai] of aiResult) {
      if (!ai.categoryId) {
        continue;
      }
      suggestions[index] = {
        source: "ai",
        categoryId: ai.categoryId,
        description: household.bankSyncAiDescriptions
          ? ai.description || null
          : null,
        confidence: ai.confidence,
      };
    }
  } catch (err) {
    console.error("[bank-sync] KI-Vorschlag fehlgeschlagen:", err);
    aiStatus.error = `KI-Vorschlag fehlgeschlagen: ${err.message}`;
  }
  return aiStatus;
}

// Ermittelt pro Zeile einen Vorschlag {source, categoryId, description, ...}
// in der Reihenfolge Schnellerfassung → Regel → Mapping → KI.
async function buildSuggestions({ household, userId, accountId, rows }) {
  const householdId = household.id;
  const suggestions = rows.map(() => null);
  const skip = new Set();
  rows.forEach((row, i) => {
    if (row.alreadyImported) {
      skip.add(i);
    }
  });

  let quickEntries = [];
  let matchedEntryIds = new Set();
  if (household.bankSyncMatchQuickEntries) {
    quickEntries = await loadPendingQuickEntries(householdId, accountId, rows);
    const { matches, usedEntryIds } = matchQuickEntries(
      rows,
      quickEntries,
      skip
    );
    matchedEntryIds = usedEntryIds;
    for (const [index, entry] of matches) {
      suggestions[index] = {
        source: "quick",
        categoryId: entry.categoryId,
        description: entry.description || null,
        matchTransactionId: entry.id,
        quickEntry: quickEntryJson(entry),
      };
    }
  }

  // Paperless-Dokumente liefern Beschreibung + Verknüpfung, aber keine
  // Kategorie → die kommt weiter aus Regel/Mapping/KI (siehe unten).
  let paperlessMatches = new Map();
  let paperlessError = null;
  if (household.bankSyncMatchPaperless) {
    const quickMatched = new Set(skip);
    suggestions.forEach((s, i) => {
      if (s) {
        quickMatched.add(i);
      }
    });
    ({ matches: paperlessMatches, error: paperlessError } =
      await matchPaperlessDocuments({
        householdId,
        rows,
        skipIndexes: quickMatched,
      }));
  }

  const rules = household.bankSyncRulesEnabled
    ? await loadRules(householdId)
    : [];
  const mappings = await MerchantCategoryMapping.findAll({
    where: { householdId },
  });
  const mappingByMerchant = new Map(
    mappings.map((m) => [m.merchantPattern, m.categoryId])
  );

  const aiPending = [];
  rows.forEach((row, i) => {
    if (skip.has(i) || suggestions[i]) {
      return;
    }
    const rule = findMatchingRule(rules, row);
    if (rule) {
      suggestions[i] = {
        source: "rule",
        categoryId: rule.categoryId,
        description: rule.description || null,
        ruleId: rule.id,
        rulePattern: rule.pattern,
      };
      return;
    }
    const merchantKey = (row.counterpartyName || "").trim().toLowerCase();
    const mappedCategoryId = merchantKey
      ? mappingByMerchant.get(merchantKey)
      : null;
    if (mappedCategoryId) {
      suggestions[i] = {
        source: "mapping",
        categoryId: mappedCategoryId,
        description: null,
      };
      return;
    }
    // Vermutliche Duplikate starten abgewählt → keine KI-Kosten dafür.
    if (!row.possibleDuplicate) {
      aiPending.push(i);
    }
  });

  const categories = await loadCategories(householdId);
  const aiStatus = await applyAiSuggestions({
    household,
    userId,
    categories,
    rows,
    pendingIndexes: aiPending,
    suggestions,
  });

  // Paperless-Dokument an den Vorschlag hängen. Dokumenttitel schlägt die
  // generische KI-Beschreibung, eine Regel-Beschreibung bleibt aber stehen.
  for (const [index, doc] of paperlessMatches) {
    const suggestion = suggestions[index];
    if (!suggestion) {
      suggestions[index] = {
        source: "paperless",
        categoryId: null,
        description: doc.title,
        paperlessDoc: doc,
      };
      continue;
    }
    suggestion.paperlessDoc = doc;
    if (!suggestion.description || suggestion.source === "ai") {
      suggestion.description = doc.title;
    }
  }
  const paperlessStatus = {
    enabled: household.bankSyncMatchPaperless,
    matched: paperlessMatches.size,
    error: paperlessError,
  };

  // Schnellerfassungen im Zeitraum der Datei ohne passenden Bankumsatz →
  // Hinweis (Barzahlung? Tippfehler beim Betrag?).
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  const unmatchedQuickEntries = dates.length
    ? quickEntries
        .filter(
          (e) =>
            !matchedEntryIds.has(e.id) &&
            e.date >= dates[0] &&
            e.date <= dates.at(-1)
        )
        .map(quickEntryJson)
    : [];

  return { suggestions, aiStatus, paperlessStatus, unmatchedQuickEntries };
}

// DELETE /api/bank-sync/imported?householdId=&accountId= — löscht alle bisher
// per Bank-Sync importierten Buchungen eines Kontos (externalRef IS NOT
// NULL, betrifft also nie manuell erfasste Buchungen). Nötig z.B. nach einer
// Parser-Verbesserung, bei der sich der Dedup-Hash ändert und ein erneuter
// Import sonst Dubletten statt Ersetzung erzeugen würde.
router.delete("/imported", auth, async (req, res) => {
  try {
    const { householdId, accountId } = req.query;
    if (!(householdId && accountId)) {
      return res
        .status(400)
        .json({ error: "householdId & accountId required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const deleted = await Transaction.destroy({
      where: { householdId, accountId, externalRef: { [Op.ne]: null } },
    });
    res.json({ deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/bank-sync/bootstrap-mappings — lernt Merchant→Kategorie einmalig
// rückwirkend aus bereits bestehenden (auch manuell erfassten) Buchungen mit
// gesetztem merchant + categoryId, statt nur vorwärts ab dem ersten Import zu
// lernen (siehe Lern-Hook in transactions.js PUT). Pro Merchant wird die
// häufigste bisher verwendete Kategorie übernommen. Idempotent (upsert).
router.post("/bootstrap-mappings", auth, async (req, res) => {
  try {
    const { householdId } = req.body;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const transactions = await Transaction.findAll({
      where: {
        householdId,
        merchant: { [Op.ne]: null },
        categoryId: { [Op.ne]: null },
      },
      attributes: ["merchant", "categoryId"],
    });

    const countsByMerchant = new Map();
    for (const t of transactions) {
      const key = (t.merchant || "").trim().toLowerCase();
      if (!key) {
        continue;
      }
      if (!countsByMerchant.has(key)) {
        countsByMerchant.set(key, new Map());
      }
      const catCounts = countsByMerchant.get(key);
      catCounts.set(t.categoryId, (catCounts.get(t.categoryId) || 0) + 1);
    }

    let merchantsLearned = 0;
    for (const [merchantPattern, catCounts] of countsByMerchant) {
      let bestCategoryId = null;
      let bestCount = 0;
      for (const [categoryId, count] of catCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestCategoryId = categoryId;
        }
      }
      if (bestCategoryId) {
        // eslint-disable-next-line no-await-in-loop
        await MerchantCategoryMapping.upsert({
          householdId,
          merchantPattern,
          categoryId: bestCategoryId,
        });
        merchantsLearned++;
      }
    }

    res.json({ merchantsLearned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/bank-sync/preview — Datei hochladen, Format erkennen, bei CSV
// Spalten-Mapping vorschlagen. Markiert Zeilen, die vermutlich bereits
// importiert oder manuell erfasst wurden. Importiert noch nichts.
router.post("/preview", auth, upload.single("file"), async (req, res) => {
  try {
    const { householdId, accountId } = req.body;
    if (!(householdId && accountId && req.file)) {
      return res
        .status(400)
        .json({ error: "householdId, accountId & file required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Optional: User hat die Spalten-Zuordnung im Frontend bereits geändert
    // (dann erneuter Preview-Request mit demselben File, aber neuem Mapping).
    const overrideMapping = req.body.columnMapping
      ? JSON.parse(req.body.columnMapping)
      : null;

    const text = req.file.buffer.toString("utf8");
    let format;
    let rows;
    let headers;
    let suggestedMapping;

    if (isMt940(text)) {
      format = "mt940";
      rows = parseMt940(text).transactions;
    } else {
      format = "csv";
      const preview = parseCsvPreview(text);
      headers = preview.headers;
      const savedProfile = await BankImportProfile.findOne({
        where: { householdId, accountId },
      });
      suggestedMapping =
        overrideMapping ||
        (savedProfile?.format === "csv" && savedProfile.columnMapping
          ? JSON.parse(savedProfile.columnMapping)
          : preview.suggestedMapping);
      rows = applyCsvMapping(preview.rawRows, suggestedMapping);
    }

    const annotatedRows = await Promise.all(
      rows.map(async (tx) => ({
        ...tx,
        alreadyImported: await isExactDuplicate(accountId, tx),
        possibleDuplicate: await findPossibleManualDuplicate(
          householdId,
          accountId,
          tx
        ),
      }))
    );

    const household = await Household.findByPk(householdId);
    const { suggestions, aiStatus, paperlessStatus, unmatchedQuickEntries } =
      await buildSuggestions({
        household,
        userId: req.user.id,
        accountId,
        rows: annotatedRows,
      });

    res.json({
      format,
      headers,
      rows: annotatedRows.map((row, i) => ({
        ...row,
        suggestion: suggestions[i],
      })),
      suggestedMapping,
      aiStatus,
      paperlessStatus,
      unmatchedQuickEntries,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// Verschmilzt eine Schnellerfassung mit dem Bankumsatz: Kategorie +
// Beschreibung des Users bleiben (sofern in der Vorschau nicht geändert),
// Bank liefert Konto, Händler, Dedup-Schlüssel und Verwendungszweck.
async function mergeIntoQuickEntry({
  entry,
  tx,
  categoryId,
  accountId,
  externalRef,
}) {
  const merchant = (tx.counterpartyName || "").trim();
  const purpose = tx.purpose || "";
  const description = (tx.description || "").trim();
  let note = entry.note || null;
  if (purpose) {
    note = note ? `${note}\n\nBank: ${purpose}` : purpose;
  }
  await entry.update({
    accountId,
    externalRef,
    pendingBankMatch: false,
    paperlessDocId: entry.paperlessDocId || parsePaperlessDocId(tx),
    merchant: entry.merchant || merchant.slice(0, TEXT_MAX_LENGTH) || null,
    categoryId: tx.categoryId === undefined ? entry.categoryId : categoryId,
    description: description
      ? description.slice(0, TEXT_MAX_LENGTH)
      : entry.description,
    note,
  });
}

function parsePaperlessDocId(tx) {
  const id = Number.parseInt(tx.paperlessDocId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Sub-Konto-Kategorien (z.B. Spesen) wie beim manuellen Anlegen behandeln:
// aus Statistik ausschließen + Period des Buchungsdatums zuordnen.
function subAccountFields(category, date, monthStartDay) {
  if (!category?.hasSubAccount) {
    return {};
  }
  const period = getPeriodForDate(date, monthStartDay || 1);
  return {
    excludeFromStats: true,
    subAccountPeriodMonth: period.month,
    subAccountPeriodYear: period.year,
  };
}

// Kategorie für eine Zeile bestimmen. Neuere Frontends schicken immer
// categoryId (auch null = bewusst leer); ältere gar keins → Mapping-Fallback.
function resolveCategoryId(tx, categoriesById, mappingByMerchant) {
  if (tx.categoryId !== undefined) {
    return categoriesById.has(tx.categoryId) ? tx.categoryId : null;
  }
  const merchant = (tx.counterpartyName || "").trim().toLowerCase();
  return mappingByMerchant.get(merchant) || null;
}

// POST /api/bank-sync/import — importiert eine vom Frontend bestätigte Liste
// von Buchungen (aus /preview, ggf. vom User gekürzt und mit geänderter
// Kategorie/Beschreibung). Kein erneuter Datei-Upload nötig, da /preview
// bereits alle Felder liefert. Dedup via externalRef bleibt als
// Sicherheitsnetz aktiv, auch wenn das Frontend schon gefiltert hat.
router.post("/import", auth, async (req, res) => {
  try {
    const { householdId, accountId, format, columnMapping, transactions } =
      req.body;
    if (!(householdId && accountId && Array.isArray(transactions))) {
      return res
        .status(400)
        .json({ error: "householdId, accountId & transactions required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const household = await Household.findByPk(householdId, {
      attributes: ["id", "monthStartDay"],
    });
    const categories = await loadCategories(householdId);
    const categoriesById = new Map(categories.map((c) => [c.id, c]));
    const mappings = await MerchantCategoryMapping.findAll({
      where: { householdId },
    });
    const mappingByMerchant = new Map(
      mappings.map((m) => [m.merchantPattern, m.categoryId])
    );

    let imported = 0;
    let merged = 0;
    let skipped = 0;
    let uncategorized = 0;
    let learned = 0;

    for (const tx of transactions) {
      if (!(tx.date && typeof tx.amount === "number")) {
        continue;
      }
      const externalRef = computeExternalRef(tx);
      // Sicherheitsnetz: exakte Dopplung immer verhindern, unabhängig davon,
      // was das Frontend geschickt hat.
      // eslint-disable-next-line no-await-in-loop
      const exists = await Transaction.findOne({
        where: { accountId, externalRef },
      });
      if (exists) {
        skipped++;
        continue;
      }

      const merchant = (tx.counterpartyName || "").trim();
      const categoryId = resolveCategoryId(
        tx,
        categoriesById,
        mappingByMerchant
      );

      // eslint-disable-next-line no-await-in-loop
      const quickEntry = tx.matchTransactionId
        ? await Transaction.findOne({
            where: {
              id: tx.matchTransactionId,
              householdId,
              pendingBankMatch: true,
              type: txType(tx.amount),
            },
          })
        : null;

      if (quickEntry) {
        // eslint-disable-next-line no-await-in-loop
        await mergeIntoQuickEntry({
          entry: quickEntry,
          tx,
          categoryId,
          accountId,
          externalRef,
        });
        merged++;
      } else {
        // description/merchant sind VARCHAR(255) - der rohe MT940-Verwendungs-
        // zweck (Feld 86) kann länger sein. Kürzen für description, voller
        // Text bleibt im unbegrenzten note-Feld erhalten. Hat der User (oder
        // Regel/KI) eine eigene Beschreibung gesetzt, wandert der
        // Verwendungszweck komplett in note.
        const purpose = tx.purpose || "";
        const customDescription = (tx.description || "").trim();
        const description = customDescription || purpose;
        const keepPurposeInNote =
          purpose.length > TEXT_MAX_LENGTH || (customDescription && purpose);

        // eslint-disable-next-line no-await-in-loop
        await Transaction.create({
          amount: Math.abs(tx.amount),
          type: txType(tx.amount),
          date: tx.date,
          description: description
            ? description.slice(0, TEXT_MAX_LENGTH)
            : null,
          note: keepPurposeInNote ? purpose : null,
          merchant: merchant ? merchant.slice(0, TEXT_MAX_LENGTH) : null,
          categoryId,
          householdId,
          userId: req.user.id,
          accountId,
          externalRef,
          paperlessDocId: parsePaperlessDocId(tx),
          ...subAccountFields(
            categoriesById.get(categoryId),
            tx.date,
            household?.monthStartDay
          ),
        });
        imported++;
      }

      if (!categoryId) {
        uncategorized++;
      }

      // Bestätigte KI-Vorschläge, manuelle Korrekturen und Schnellerfassungen
      // als Merchant→Kategorie lernen → nächstes Mal ohne KI zugeordnet.
      const merchantKey = merchant.toLowerCase();
      const shouldLearn =
        categoryId &&
        merchantKey &&
        LEARNING_SOURCES.has(tx.suggestionSource) &&
        mappingByMerchant.get(merchantKey) !== categoryId;
      if (shouldLearn) {
        // eslint-disable-next-line no-await-in-loop
        await MerchantCategoryMapping.upsert({
          householdId,
          merchantPattern: merchantKey,
          categoryId,
        });
        mappingByMerchant.set(merchantKey, categoryId);
        learned++;
      }
    }

    if (format === "csv" && columnMapping) {
      await BankImportProfile.upsert({
        householdId,
        accountId,
        format: "csv",
        columnMapping: JSON.stringify(columnMapping),
      });
    }

    res.json({ imported, merged, skipped, uncategorized, learned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// ── Einstellungen: automatische Zuordnung ────────────────────────────────────

function settingsJson(
  household,
  { aiKeyAvailable, canEditLocalServer, paperlessConfigured }
) {
  return {
    matchQuickEntries: household.bankSyncMatchQuickEntries,
    matchPaperless: household.bankSyncMatchPaperless,
    paperlessConfigured,
    rulesEnabled: household.bankSyncRulesEnabled,
    aiEnabled: household.bankSyncAiEnabled,
    aiProvider: household.bankSyncAiProvider || AI_PROVIDERS.anthropic,
    aiModel: household.bankSyncAiModel || DEFAULT_AI_MODEL,
    aiDescriptions: household.bankSyncAiDescriptions,
    aiKeyAvailable,
    aiModels: AI_MODELS,
    localUrl: household.bankSyncLocalUrl || "",
    localModel: household.bankSyncLocalModel || "",
    // Key selbst nie ausliefern, nur ob einer gesetzt ist.
    localHasApiKey: !!household.bankSyncLocalApiKey,
    canEditLocalServer,
  };
}

async function sendSettings(res, household, member, userId) {
  const apiKey = await resolveApiKey(household.id, userId);
  const paperlessConfig = await PaperlessConfig.findOne({
    where: { householdId: household.id, isActive: true },
    attributes: ["id"],
  });
  res.json(
    settingsJson(household, {
      aiKeyAvailable: !!apiKey,
      canEditLocalServer: member?.role === "admin",
      paperlessConfigured: !!paperlessConfig,
    })
  );
}

// GET /api/bank-sync/settings?householdId=
router.get("/settings", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const member = await checkAccess(req.user.id, householdId);
    const household = await Household.findByPk(householdId);
    await sendSettings(res, household, member, req.user.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// Übernimmt die Felder des eigenen KI-Servers aus dem Request (nur Admins).
// Gibt {error} bei ungültiger Adresse zurück.
function applyLocalServerUpdates(body, updates) {
  if (body.localUrl !== undefined) {
    const trimmed = String(body.localUrl || "").trim();
    if (trimmed && !normalizeLocalUrl(trimmed)) {
      return {
        error: "Ungültige Adresse. Beispiel: http://192.168.1.10:11434/v1",
      };
    }
    updates.bankSyncLocalUrl = trimmed || null;
  }
  if (body.localModel !== undefined) {
    updates.bankSyncLocalModel = String(body.localModel || "").trim() || null;
  }
  // Leerer String = Key löschen, undefined = unverändert lassen.
  if (body.localApiKey !== undefined) {
    updates.bankSyncLocalApiKey = String(body.localApiKey || "").trim() || null;
  }
  return {};
}

const LOCAL_SERVER_FIELDS = ["localUrl", "localModel", "localApiKey"];

// PUT /api/bank-sync/settings — { householdId, matchQuickEntries?, ... }
router.put("/settings", auth, async (req, res) => {
  try {
    const { householdId } = req.body;
    const member = await checkWriteAccess(req.user.id, householdId);
    if (!member) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const household = await Household.findByPk(householdId);
    const fields = {
      matchQuickEntries: "bankSyncMatchQuickEntries",
      matchPaperless: "bankSyncMatchPaperless",
      rulesEnabled: "bankSyncRulesEnabled",
      aiEnabled: "bankSyncAiEnabled",
      aiDescriptions: "bankSyncAiDescriptions",
    };
    const updates = {};
    for (const [key, column] of Object.entries(fields)) {
      if (typeof req.body[key] === "boolean") {
        updates[column] = req.body[key];
      }
    }
    if (AI_MODELS.some((m) => m.id === req.body.aiModel)) {
      updates.bankSyncAiModel = req.body.aiModel;
    }
    if (Object.values(AI_PROVIDERS).includes(req.body.aiProvider)) {
      updates.bankSyncAiProvider = req.body.aiProvider;
    }
    const touchesLocalServer = LOCAL_SERVER_FIELDS.some(
      (f) => req.body[f] !== undefined
    );
    if (touchesLocalServer) {
      if (member.role !== "admin") {
        return res.status(403).json({
          error: "Nur Admins des Haushaltsbuchs können den KI-Server ändern.",
        });
      }
      const { error } = applyLocalServerUpdates(req.body, updates);
      if (error) {
        return res.status(400).json({ error });
      }
    }
    await household.update(updates);
    await sendSettings(res, household, member, req.user.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/bank-sync/settings/test-local — { householdId, localUrl?,
// localApiKey? } prüft die Verbindung zum eigenen KI-Server und liefert die
// dort verfügbaren Modelle. Ohne localUrl/localApiKey werden die
// gespeicherten Werte verwendet (Key wird nie zurückgegeben).
router.post("/settings/test-local", auth, async (req, res) => {
  try {
    const { householdId } = req.body;
    if (!(await checkAdminAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const household = await Household.findByPk(householdId);
    const baseUrl = normalizeLocalUrl(
      req.body.localUrl || household.bankSyncLocalUrl
    );
    if (!baseUrl) {
      return res.status(400).json({
        error: "Ungültige Adresse. Beispiel: http://192.168.1.10:11434/v1",
      });
    }
    const apiKey =
      req.body.localApiKey === undefined
        ? household.bankSyncLocalApiKey
        : String(req.body.localApiKey || "").trim() || null;
    try {
      const models = await listLocalModels({ baseUrl, apiKey });
      res.json({ ok: true, baseUrl, models });
    } catch (err) {
      res.json({ ok: false, baseUrl, error: err.message, models: [] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// ── Regeln ───────────────────────────────────────────────────────────────────

const RULE_FIELDS = new Set(["any", "counterparty", "purpose", "iban"]);

function parseOptionalAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

// Validiert + normalisiert Regel-Eingaben. Gibt {error} oder {data} zurück.
async function parseRuleInput(body, householdId) {
  const pattern = (body.pattern || "").trim();
  if (!pattern) {
    return { error: "Suchbegriff fehlt" };
  }
  const field = RULE_FIELDS.has(body.field) ? body.field : "any";
  const category = body.categoryId
    ? await Category.findOne({
        where: {
          id: body.categoryId,
          [Op.or]: [{ householdId }, { householdId: null, isSystem: true }],
        },
      })
    : null;
  if (!category) {
    return { error: "Kategorie fehlt oder ist ungültig" };
  }
  return {
    data: {
      field,
      pattern,
      minAmount: parseOptionalAmount(body.minAmount),
      maxAmount: parseOptionalAmount(body.maxAmount),
      categoryId: category.id,
      description: (body.description || "").trim() || null,
      sortOrder: Number.parseInt(body.sortOrder, 10) || 0,
    },
  };
}

// GET /api/bank-sync/rules?householdId=
router.get("/rules", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const rules = await BankCategorizationRule.findAll({
      where: { householdId },
      include: [
        { model: Category, attributes: ["id", "name", "nameDE", "icon"] },
      ],
      order: [
        ["sortOrder", "ASC"],
        ["createdAt", "ASC"],
      ],
    });
    res.json({ rules });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/bank-sync/rules
router.post("/rules", auth, async (req, res) => {
  try {
    const { householdId } = req.body;
    if (!(await checkWriteAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { error, data } = await parseRuleInput(req.body, householdId);
    if (error) {
      return res.status(400).json({ error });
    }
    const rule = await BankCategorizationRule.create({ ...data, householdId });
    res.status(201).json({ rule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// PUT /api/bank-sync/rules/:id
router.put("/rules/:id", auth, async (req, res) => {
  try {
    const rule = await BankCategorizationRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Regel nicht gefunden" });
    }
    if (!(await checkWriteAccess(req.user.id, rule.householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { error, data } = await parseRuleInput(req.body, rule.householdId);
    if (error) {
      return res.status(400).json({ error });
    }
    await rule.update(data);
    res.json({ rule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// DELETE /api/bank-sync/rules/:id
router.delete("/rules/:id", auth, async (req, res) => {
  try {
    const rule = await BankCategorizationRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Regel nicht gefunden" });
    }
    if (!(await checkWriteAccess(req.user.id, rule.householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await rule.destroy();
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// ── Offene Schnellerfassungen ────────────────────────────────────────────────

// GET /api/bank-sync/quick-entries?householdId= — alle noch nicht mit einem
// Bankumsatz verschmolzenen Schnellerfassungen.
router.get("/quick-entries", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const entries = await Transaction.findAll({
      where: { householdId, pendingBankMatch: true },
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
      ],
      order: [["date", "DESC"]],
    });
    res.json({ entries: entries.map(quickEntryJson) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// PUT /api/bank-sync/quick-entries/:id/dismiss — "Bar bezahlt": Buchung
// bleibt, wird aber nicht mehr mit Bankumsätzen abgeglichen.
router.put("/quick-entries/:id/dismiss", auth, async (req, res) => {
  try {
    const entry = await Transaction.findByPk(req.params.id);
    if (!entry?.pendingBankMatch) {
      return res.status(404).json({ error: "Schnellerfassung nicht gefunden" });
    }
    if (!(await checkWriteAccess(req.user.id, entry.householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await entry.update({ pendingBankMatch: false });
    res.json({ dismissed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
