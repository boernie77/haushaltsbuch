// Bank-Sync-Feature: manueller CSV/MT940-Datei-Import (kein Live-FinTS-Zugang
// nötig). User exportiert Umsätze aus dem Online-Banking (Sparda-Bank Nürnberg
// bietet CSV/MT940/CAMT.052, ING bietet CSV) und lädt die Datei hier hoch.
const crypto = require("node:crypto");
const router = require("express").Router();
const multer = require("multer");
const { Op } = require("sequelize");
const {
  BankImportProfile,
  HouseholdMember,
  Transaction,
  MerchantCategoryMapping,
} = require("../models");
const { auth } = require("../middleware/auth");
const {
  isMt940,
  parseMt940,
  parseCsvPreview,
  applyCsvMapping,
} = require("../utils/bankImport");

// Kleine Textdateien, nur zum Parsen - keine Disk-Persistenz nötig.
const upload = multer({ storage: multer.memoryStorage() });

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
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
    },
  });
  return !!candidate;
}

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

    res.json({
      format,
      headers,
      rows: annotatedRows,
      suggestedMapping,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/bank-sync/import — importiert eine vom Frontend bestätigte Liste
// von Buchungen (aus /preview, ggf. vom User gekürzt). Kein erneuter
// Datei-Upload nötig, da /preview bereits alle Felder liefert. Dedup via
// externalRef bleibt als Sicherheitsnetz aktiv, auch wenn das Frontend schon
// gefiltert hat.
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

    const mappings = await MerchantCategoryMapping.findAll({
      where: { householdId },
    });
    const mappingByMerchant = new Map(
      mappings.map((m) => [m.merchantPattern, m.categoryId])
    );

    let imported = 0;
    let skipped = 0;
    let uncategorized = 0;

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
      const categoryId = mappingByMerchant.get(merchant.toLowerCase()) || null;
      if (!categoryId) {
        uncategorized++;
      }

      // eslint-disable-next-line no-await-in-loop
      await Transaction.create({
        amount: Math.abs(tx.amount),
        type: tx.amount < 0 ? "expense" : "income",
        date: tx.date,
        description: tx.purpose || null,
        merchant: merchant || null,
        categoryId,
        householdId,
        userId: req.user.id,
        accountId,
        externalRef,
      });
      imported++;
    }

    if (format === "csv" && columnMapping) {
      await BankImportProfile.upsert({
        householdId,
        accountId,
        format: "csv",
        columnMapping: JSON.stringify(columnMapping),
      });
    }

    res.json({ imported, skipped, uncategorized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
