const router = require("express").Router();
const { Op } = require("sequelize");
const multer = require("multer");
const path = require("path");
const {
  Transaction,
  TransactionSplit,
  Category,
  User,
  Household,
  HouseholdMember,
  Budget,
  sequelize,
} = require("../models");
const { auth } = require("../middleware/auth");
const { checkBudgetWarning } = require("../services/budgetService");
const { getMonthBounds } = require("../utils/monthBounds");
const {
  customDescription,
  merchantKeys,
  signedAmount,
  storedPurpose,
} = require("../utils/merchantLearning");

// FormData fields can arrive as arrays if appended twice — normalize to scalar.
function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

// Berechnet das nächste Fälligkeitsdatum NACH heute
function calcNextFutureDate(date, interval, recurringDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  while (next <= today) {
    if (interval === "weekly") {
      next.setDate(next.getDate() + 7);
    } else if (interval === "monthly") {
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      if (recurringDay) {
        const maxDay = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0
        ).getDate();
        next.setDate(Math.min(recurringDay, maxDay));
      }
    } else if (interval === "yearly") {
      next.setFullYear(next.getFullYear() + 1);
    }
  }
  return next;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(__dirname, "../../uploads")),
  filename: (req, file, cb) =>
    cb(null, `receipt_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Helper: check household access
async function checkHouseholdAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// GET /api/transactions?householdId=&month=&year=&categoryId=&type=&page=&limit=
router.get("/", auth, async (req, res) => {
  try {
    const {
      householdId,
      month,
      year,
      categoryId,
      type,
      page = 1,
      limit = 50,
      search,
    } = req.query;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }

    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = { householdId, isRecurring: { [Op.ne]: true } };
    if (type) {
      where.type = type;
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (search) {
      const orConds = [
        { description: { [Op.iLike]: `%${search}%` } },
        { merchant: { [Op.iLike]: `%${search}%` } },
      ];
      // Auch nach Betrag suchen: "12,50" oder "12.50" oder Teilstring "12".
      // amount wird als Text gecastet, damit Teiltreffer funktionieren.
      const amountSearch = search.trim().replace(",", ".");
      if (/\d/.test(amountSearch)) {
        // Spalte qualifizieren: TransactionSplit (Include "splits") hat
        // ebenfalls eine Spalte "amount" → unqualifiziert wäre der Verweis in
        // SQL mehrdeutig und die ganze Suche bräche mit einem Fehler ab.
        orConds.push(
          sequelize.where(
            sequelize.cast(sequelize.col("Transaction.amount"), "text"),
            { [Op.iLike]: `%${amountSearch}%` }
          )
        );
      }
      where[Op.or] = orConds;
    }

    if (month && year) {
      const household = await Household.findByPk(householdId, {
        attributes: ["monthStartDay"],
      });
      const { start: startDate, end: endDate } = getMonthBounds(
        Number.parseInt(year),
        Number.parseInt(month),
        household?.monthStartDay || 1
      );
      where.date = { [Op.between]: [startDate, endDate] };
    } else if (year) {
      where.date = {
        [Op.between]: [new Date(year, 0, 1), new Date(year, 11, 31)],
      };
    }

    // Bei Periode-Filter (month+year) kein Limit: eine Period ist natürlich
    // begrenzt (≤ paar Hundert Buchungen). Das alte Default-Limit=50 hat bei
    // großen Periods die ältesten Buchungen (z.B. wiederkehrende vom 1.) aus
    // der Liste fallen lassen, weil sortiert nach date DESC.
    const periodFilterActive = Boolean(month && year);
    const pageLimit = periodFilterActive ? null : Number.parseInt(limit);
    const queryOptions = {
      where,
      distinct: true,
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
        { model: User, attributes: ["id", "name", "avatar"] },
        {
          model: TransactionSplit,
          as: "splits",
          include: [
            {
              model: Category,
              attributes: ["id", "name", "nameDE", "icon", "color"],
            },
          ],
        },
      ],
      order: [
        ["date", "DESC"],
        ["createdAt", "DESC"],
      ],
    };
    if (pageLimit) {
      queryOptions.limit = pageLimit;
      queryOptions.offset = (Number.parseInt(page) - 1) * pageLimit;
    }
    const { count, rows } = await Transaction.findAndCountAll(queryOptions);

    res.json({
      transactions: rows,
      total: count,
      page: Number.parseInt(page),
      totalPages: pageLimit ? Math.ceil(count / pageLimit) : 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// GET /api/transactions/recurring?householdId=
router.get("/recurring", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }
    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    const rows = await Transaction.findAll({
      where: { householdId, isRecurring: true },
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
      ],
      order: [["recurringNextDate", "ASC"]],
    });
    res.json({ recurring: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recurring" });
  }
});

// DELETE /api/transactions/recurring/:id — Wiederkehrende Buchung beenden
router.delete("/recurring/:id", auth, async (req, res) => {
  try {
    const t = await Transaction.findByPk(req.params.id);
    if (!t) {
      return res.status(404).json({ error: "Not found" });
    }
    const access = await checkHouseholdAccess(req.user.id, t.householdId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }
    await t.update({ isRecurring: false, recurringNextDate: null });
    res.json({ message: "Recurring stopped" });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// ── Schnellerfassung: Kategorie-Kacheln ──────────────────────────────────────
// Pro Mitglied + Haushaltsbuch selbst gewählt und sortiert
// (household_members."quickCategories"). Ohne eigene Auswahl: automatisch
// nach Nutzung der letzten 90 Tage — nur von Hand erfasste Buchungen, damit
// Daueraufträge und Bank-Importe (Kredit, Versicherung, …) nicht dominieren.
const QUICK_CATEGORY_USAGE_DAYS = 90;
// 3 Reihen à 4 Kacheln, eine davon ist "Mehr".
const QUICK_CATEGORY_MAX_TILES = 11;
const QUICK_CATEGORY_DEFAULT_TILES = 7;

function quickCategoryType(value) {
  return value === "income" ? "income" : "expense";
}

function parseQuickCategories(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadHouseholdCategories(householdId) {
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

async function mostUsedCategoryIds(householdId, type) {
  const since = new Date();
  since.setDate(since.getDate() - QUICK_CATEGORY_USAGE_DAYS);
  const usage = await Transaction.findAll({
    attributes: [
      "categoryId",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    where: {
      householdId,
      type,
      categoryId: { [Op.ne]: null },
      isRecurring: { [Op.ne]: true },
      recurringSourceId: null,
      externalRef: null,
      date: { [Op.gte]: since },
    },
    group: ["categoryId"],
    order: [[sequelize.literal("count"), "DESC"]],
    raw: true,
  });
  return usage.map((u) => u.categoryId);
}

// GET /api/transactions/quick-categories?householdId=&type=
// → { categories, custom, maxTiles }
async function getQuickCategories(req, res) {
  try {
    const { householdId } = req.query;
    const type = quickCategoryType(req.query.type);
    const member = await checkHouseholdAccess(req.user.id, householdId);
    if (!member) {
      return res.status(403).json({ error: "Access denied" });
    }
    const categories = await loadHouseholdCategories(householdId);
    const byId = new Map(categories.map((c) => [c.id, c]));

    const customIds = parseQuickCategories(member.quickCategories)[type];
    const custom = Array.isArray(customIds) && customIds.length > 0;
    let tiles;
    if (custom) {
      // Gelöschte Kategorien fallen still heraus.
      tiles = customIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
      const usedIds = await mostUsedCategoryIds(householdId, type);
      tiles = usedIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .slice(0, QUICK_CATEGORY_DEFAULT_TILES);
    }
    res.json({
      categories: tiles.slice(0, QUICK_CATEGORY_MAX_TILES),
      custom,
      maxTiles: QUICK_CATEGORY_MAX_TILES,
    });
  } catch (err) {
    console.error("[GET /transactions/quick-categories]", err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
}
router.get("/quick-categories", auth, getQuickCategories);
// Alter Pfad (App v1.0.17/18) — gleiche Logik.
router.get("/frequent-categories", auth, getQuickCategories);

// PUT /api/transactions/quick-categories — { householdId, type, categoryIds }
// Leere Liste = zurück auf automatisch.
router.put("/quick-categories", auth, async (req, res) => {
  try {
    const { householdId, categoryIds } = req.body;
    const type = quickCategoryType(req.body.type);
    const member = await checkHouseholdAccess(req.user.id, householdId);
    if (!member) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "categoryIds required" });
    }
    const categories = await loadHouseholdCategories(householdId);
    const validIds = new Set(categories.map((c) => c.id));
    const ids = [...new Set(categoryIds)]
      .filter((id) => validIds.has(id))
      .slice(0, QUICK_CATEGORY_MAX_TILES);
    const config = parseQuickCategories(member.quickCategories);
    config[type] = ids;
    await member.update({ quickCategories: JSON.stringify(config) });
    return getQuickCategories({ ...req, query: { householdId, type } }, res);
  } catch (err) {
    console.error("[PUT /transactions/quick-categories]", err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/transactions
router.post("/", auth, upload.single("receipt"), async (req, res) => {
  try {
    // multer kann bei doppelt angehängten Feldern Arrays liefern → normalisieren
    const amount = firstValue(req.body.amount);
    const description = firstValue(req.body.description);
    const note = firstValue(req.body.note);
    const date = firstValue(req.body.date);
    const type = firstValue(req.body.type);
    const categoryId = firstValue(req.body.categoryId) || null;
    const householdId = firstValue(req.body.householdId);
    const merchant = firstValue(req.body.merchant);
    const tags = firstValue(req.body.tags);
    const isConfirmed = firstValue(req.body.isConfirmed);
    const isRecurring = firstValue(req.body.isRecurring);
    const recurringInterval = firstValue(req.body.recurringInterval);
    const recurringDay = firstValue(req.body.recurringDay);
    const recurringEndDate = firstValue(req.body.recurringEndDate);
    const isPersonal = firstValue(req.body.isPersonal);
    const targetHouseholdId = firstValue(req.body.targetHouseholdId) || null;
    const accountId = firstValue(req.body.accountId) || null;
    const transferTargetAccountId =
      firstValue(req.body.transferTargetAccountId) || null;
    const subAccountPeriodMonth = firstValue(req.body.subAccountPeriodMonth);
    const subAccountPeriodYear = firstValue(req.body.subAccountPeriodYear);
    const splits = firstValue(req.body.splits);
    const tip = firstValue(req.body.tip);
    const pendingBankMatch = firstValue(req.body.pendingBankMatch);

    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    const recurringActive = isRecurring === "true" || isRecurring === true;

    // recurringDay automatisch aus dem Datum ableiten wenn nicht explizit gesetzt
    const effectiveRecurringDay = recurringDay
      ? Number.parseInt(recurringDay)
      : date
        ? new Date(date).getDate()
        : null;

    // Fälligkeitsdatum berechnen
    let recurringNextDate = null;
    let createImmediateCopy = false;
    if (recurringActive && date) {
      if (!recurringInterval) {
        return res
          .status(400)
          .json({ error: "recurringInterval ist Pflicht für Wiederholungen" });
      }
      const bookingDate = new Date(date);
      bookingDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (bookingDate <= today) {
        // Datum in Vergangenheit/heute → sofort Buchung anlegen, nächstes Datum = Zukunft
        createImmediateCopy = true;
        recurringNextDate = calcNextFutureDate(
          bookingDate,
          recurringInterval,
          effectiveRecurringDay
        );
      } else {
        recurringNextDate = bookingDate;
      }
    }

    // Quittungsbild verarbeiten (Dokument-Scan-Filter)
    if (req.file) {
      const { processReceiptFile } = require("../utils/receiptProcessor");
      await processReceiptFile(req.file.path);
    }

    const parsedTags = tags
      ? (() => {
          try {
            return JSON.parse(tags);
          } catch {
            return [];
          }
        })()
      : [];

    // Sub-Account-Logik: Wenn die Kategorie hasSubAccount=true hat, wird die
    // Buchung in der Statistik standardmäßig ausgeschlossen und einer Period
    // zugeordnet (Default = aktuelle Period gemäß monthStartDay des Haushalts).
    let resolvedSubAccountMonth = null;
    let resolvedSubAccountYear = null;
    let resolvedExcludeFromStats = false;
    if (categoryId) {
      const { Category, Household } = require("../models");
      const cat = await Category.findByPk(categoryId);
      if (cat?.hasSubAccount) {
        resolvedExcludeFromStats = true;
        const explicitMonth = subAccountPeriodMonth
          ? Number.parseInt(subAccountPeriodMonth, 10)
          : null;
        const explicitYear = subAccountPeriodYear
          ? Number.parseInt(subAccountPeriodYear, 10)
          : null;
        if (explicitMonth && explicitYear) {
          resolvedSubAccountMonth = explicitMonth;
          resolvedSubAccountYear = explicitYear;
        } else {
          // Default = aktuelle Period des Haushalts
          const { getPeriodForDate } = require("../utils/monthBounds");
          const household = await Household.findByPk(householdId, {
            attributes: ["monthStartDay"],
          });
          const period = getPeriodForDate(
            new Date(),
            household?.monthStartDay || 1
          );
          resolvedSubAccountMonth = period.month;
          resolvedSubAccountYear = period.year;
        }
      }
    }

    const transaction = await Transaction.create({
      amount: Number.parseFloat(amount),
      description: description || null,
      note: note || null,
      date: date || new Date(),
      type: type || "expense",
      categoryId,
      householdId,
      userId: req.user.id,
      merchant: merchant || null,
      tags: parsedTags,
      receiptImage: req.file ? `/uploads/${req.file.filename}` : null,
      isConfirmed: isConfirmed !== "false",
      isRecurring: recurringActive,
      recurringInterval: recurringActive ? recurringInterval : null,
      recurringDay: recurringActive ? effectiveRecurringDay : null,
      recurringNextDate,
      recurringEndDate:
        recurringActive && recurringEndDate ? recurringEndDate : null,
      isPersonal: isPersonal === "true" || isPersonal === true,
      targetHouseholdId: type === "transfer" ? targetHouseholdId : null,
      tip: tip ? Number.parseFloat(tip) : 0,
      accountId,
      transferTargetAccountId:
        type === "transfer" ? transferTargetAccountId : null,
      subAccountPeriodMonth: resolvedSubAccountMonth,
      subAccountPeriodYear: resolvedSubAccountYear,
      excludeFromStats: resolvedExcludeFromStats,
      // Schnellerfassung (Mobile): wird beim nächsten Bank-Sync-Import mit
      // dem passenden Bankumsatz verschmolzen (siehe routes/bankSync.js).
      pendingBankMatch:
        !recurringActive &&
        (pendingBankMatch === "true" || pendingBankMatch === true),
    });

    // Splits speichern falls vorhanden
    if (splits) {
      const splitData =
        typeof splits === "string" ? JSON.parse(splits) : splits;
      if (Array.isArray(splitData) && splitData.length > 0) {
        await TransactionSplit.bulkCreate(
          splitData.map((s) => ({
            transactionId: transaction.id,
            categoryId: s.categoryId || null,
            amount: Number.parseFloat(s.amount),
            description: s.description || null,
          }))
        );
      }
    }

    // Sofortige Buchungskopie für vergangenes Datum anlegen
    if (createImmediateCopy) {
      await Transaction.create({
        amount: Number.parseFloat(amount),
        description: description || null,
        note: note || null,
        date,
        type: type || "expense",
        categoryId,
        householdId,
        userId: req.user.id,
        merchant: merchant || null,
        tags: parsedTags,
        isConfirmed: true,
        isRecurring: false,
        isPersonal: isPersonal === "true" || isPersonal === true,
      });
    }

    const full = await Transaction.findByPk(transaction.id, {
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
        { model: User, attributes: ["id", "name", "avatar"] },
        {
          model: TransactionSplit,
          as: "splits",
          include: [
            {
              model: Category,
              attributes: ["id", "name", "nameDE", "icon", "color"],
            },
          ],
        },
      ],
    });

    // Check budget warning
    const warning = await checkBudgetWarning(
      householdId,
      categoryId,
      date || new Date()
    );

    res.status(201).json({ transaction: full, budgetWarning: warning });
  } catch (err) {
    console.error("[POST /transactions]", err);
    res.status(500).json({
      error: err.message
        ? `Fehler: ${err.message}`
        : "Failed to create transaction",
    });
  }
});

// PUT /api/transactions/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await checkHouseholdAccess(
      req.user.id,
      transaction.householdId
    );
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    const {
      amount,
      description,
      note,
      date,
      type,
      categoryId,
      merchant,
      tags,
      isConfirmed,
      isRecurring,
      recurringInterval,
      recurringEndDate,
      tip,
      accountId,
      transferTargetAccountId,
      subAccountPeriodMonth,
      subAccountPeriodYear,
    } = req.body;
    const updates = {
      amount,
      description,
      note,
      date,
      type,
      categoryId,
      merchant,
      tags,
      isConfirmed,
    };
    if (tip !== undefined) {
      updates.tip = Number.parseFloat(tip) || 0;
    }
    if (accountId !== undefined) {
      updates.accountId = accountId || null;
    }
    if (transferTargetAccountId !== undefined) {
      updates.transferTargetAccountId =
        (type ?? transaction.type) === "transfer"
          ? transferTargetAccountId || null
          : null;
    }

    // Sub-Account-Felder beim Edit pflegen: Wenn die Kategorie hasSubAccount
    // hat → Period übernehmen + excludeFromStats = true. Wenn die Kategorie
    // GEWECHSELT wird auf eine ohne hasSubAccount → Felder zurücksetzen.
    const effectiveCategoryId = categoryId ?? transaction.categoryId;
    if (effectiveCategoryId) {
      const { Category, Household } = require("../models");
      const cat = await Category.findByPk(effectiveCategoryId);
      if (cat?.hasSubAccount) {
        updates.excludeFromStats = true;
        const explicitMonth = subAccountPeriodMonth
          ? Number.parseInt(subAccountPeriodMonth, 10)
          : null;
        const explicitYear = subAccountPeriodYear
          ? Number.parseInt(subAccountPeriodYear, 10)
          : null;
        if (explicitMonth && explicitYear) {
          updates.subAccountPeriodMonth = explicitMonth;
          updates.subAccountPeriodYear = explicitYear;
        } else if (
          !(
            transaction.subAccountPeriodMonth &&
            transaction.subAccountPeriodYear
          )
        ) {
          // Bisher keine Period gesetzt (frische Sub-Account-Zuordnung) →
          // aktuelle Period als Default
          const { getPeriodForDate } = require("../utils/monthBounds");
          const household = await Household.findByPk(transaction.householdId, {
            attributes: ["monthStartDay"],
          });
          const period = getPeriodForDate(
            new Date(),
            household?.monthStartDay || 1
          );
          updates.subAccountPeriodMonth = period.month;
          updates.subAccountPeriodYear = period.year;
        }
      } else if (
        !transaction.isSubAccountSettlement &&
        transaction.excludeFromStats
      ) {
        // Kategorie war Sub-Account, jetzt nicht mehr → zurück in Statistik
        updates.excludeFromStats = false;
        updates.subAccountPeriodMonth = null;
        updates.subAccountPeriodYear = null;
      }
    }

    const isRecurringBool =
      isRecurring === undefined ? transaction.isRecurring : isRecurring;
    if (isRecurring !== undefined) {
      updates.isRecurring = isRecurring;
      updates.recurringInterval = isRecurring ? recurringInterval : null;
      updates.recurringDay = isRecurring
        ? date
          ? new Date(date).getDate()
          : transaction.recurringDay
        : null;
      updates.recurringEndDate =
        isRecurring && recurringEndDate ? recurringEndDate : null;
    }

    // Bei Datum-Änderung auf einem Template: recurringNextDate neu berechnen
    if (isRecurringBool && date) {
      const bookingDate = new Date(date);
      bookingDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const interval =
        (isRecurring === undefined ? null : recurringInterval) ||
        transaction.recurringInterval;
      const day = date ? new Date(date).getDate() : transaction.recurringDay;
      if (bookingDate <= today) {
        updates.recurringNextDate = calcNextFutureDate(
          bookingDate,
          interval,
          day
        );
        // Sofortige Buchungskopie für das vergangene Datum
        await Transaction.create({
          amount: Number.parseFloat(amount ?? transaction.amount),
          description: description ?? transaction.description,
          note: note ?? transaction.note,
          date,
          type: type ?? transaction.type,
          categoryId: categoryId ?? transaction.categoryId,
          householdId: transaction.householdId,
          userId: transaction.userId,
          merchant: merchant ?? transaction.merchant,
          tags: tags ?? transaction.tags ?? [],
          isConfirmed: true,
          isRecurring: false,
        });
      } else {
        updates.recurringNextDate = bookingDate;
      }
    }

    await transaction.update(updates);

    // Bank-Sync-Lernmechanismus: Wenn eine importierte Buchung (externalRef
    // gesetzt) manuell kategorisiert wird, merken wir uns Händler→Kategorie
    // und Händler|Betrag→Kategorie+Beschreibung für künftige Importe (siehe
    // utils/merchantLearning.js). PayPal & Co. nur über den echten Händler.
    if (categoryId && transaction.externalRef && transaction.merchant) {
      const { MerchantCategoryMapping } = require("../models");
      const { merchantKey, amountKey } = merchantKeys({
        counterpartyName: transaction.merchant,
        purpose: storedPurpose(transaction),
        amount: signedAmount(transaction),
      });
      const value = {
        householdId: transaction.householdId,
        categoryId,
        targetAccountId: null,
      };
      if (merchantKey) {
        await MerchantCategoryMapping.upsert({
          ...value,
          merchantPattern: merchantKey,
        });
      }
      if (amountKey) {
        const description = customDescription(transaction);
        await MerchantCategoryMapping.upsert({
          ...value,
          merchantPattern: amountKey,
          description: description ? description.slice(0, 255) : null,
        });
      }
    }

    const full = await Transaction.findByPk(transaction.id, {
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
        { model: User, attributes: ["id", "name", "avatar"] },
      ],
    });

    res.json({ transaction: full });
  } catch (err) {
    res.status(500).json({ error: "Failed to update transaction" });
  }
});

// PUT /api/transactions/:id/move — Buchung in anderes Haushaltsbuch verschieben
router.put("/:id/move", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: "Not found" });
    }

    const sourceAccess = await checkHouseholdAccess(
      req.user.id,
      transaction.householdId
    );
    if (!sourceAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { targetHouseholdId } = req.body;
    if (!targetHouseholdId) {
      return res.status(400).json({ error: "targetHouseholdId required" });
    }

    const targetAccess = await checkHouseholdAccess(
      req.user.id,
      targetHouseholdId
    );
    if (!targetAccess) {
      return res
        .status(403)
        .json({ error: "Kein Zugriff auf Ziel-Haushaltsbuch" });
    }

    // Kategorie: Systemkategorien bleiben, benutzerdefinierte werden entfernt wenn nicht im Ziel verfügbar
    let warning = null;
    if (transaction.categoryId) {
      const cat = await Category.findByPk(transaction.categoryId);
      if (
        cat &&
        !cat.isSystem &&
        cat.householdId &&
        cat.householdId !== targetHouseholdId
      ) {
        await transaction.update({
          householdId: targetHouseholdId,
          categoryId: null,
        });
        warning =
          "Kategorie wurde entfernt (nicht im Ziel-Haushaltsbuch verfügbar)";
        const full = await Transaction.findByPk(transaction.id, {
          include: [
            { model: Category },
            { model: User, attributes: ["id", "name", "avatar"] },
          ],
        });
        return res.json({ transaction: full, warning });
      }
    }

    await transaction.update({ householdId: targetHouseholdId });
    res.json({ transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to move transaction" });
  }
});

// DELETE /api/transactions/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await checkHouseholdAccess(
      req.user.id,
      transaction.householdId
    );
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    await transaction.destroy();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// POST /api/transactions/duplicate-check
router.post("/duplicate-check", auth, async (req, res) => {
  try {
    const { householdId, amount, date, description, merchant, excludeId } =
      req.body;
    if (!(await checkHouseholdAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const checkDate = new Date(date);
    const from = new Date(checkDate);
    from.setDate(from.getDate() - 3);
    const to = new Date(checkDate);
    to.setDate(to.getDate() + 3);

    const where = {
      householdId,
      isRecurring: { [Op.ne]: true },
      amount: {
        [Op.between]: [
          Number.parseFloat(amount) - 0.01,
          Number.parseFloat(amount) + 0.01,
        ],
      },
      date: { [Op.between]: [from, to] },
    };
    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const candidates = await Transaction.findAll({
      where,
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
      ],
      limit: 5,
    });

    // Filter by description/merchant similarity
    const searchTerm = (description || merchant || "").toLowerCase();
    const duplicates = searchTerm
      ? candidates.filter(
          (t) =>
            (t.description || "").toLowerCase().includes(searchTerm) ||
            (t.merchant || "").toLowerCase().includes(searchTerm) ||
            searchTerm.includes((t.description || "").toLowerCase()) ||
            searchTerm.includes((t.merchant || "").toLowerCase())
        )
      : candidates;

    res.json({ duplicates });
  } catch (err) {
    res.status(500).json({ error: "Duplicate check failed" });
  }
});

module.exports = router;
