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
} = require("../models");
const { auth } = require("../middleware/auth");
const { checkBudgetWarning } = require("../services/budgetService");
const { getMonthBounds } = require("../utils/monthBounds");

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
    cb(null, path.join(import.meta.dirname, "../../uploads")),
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
      where[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { merchant: { [Op.iLike]: `%${search}%` } },
      ];
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

    const { count, rows } = await Transaction.findAndCountAll({
      where,
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
      limit: Number.parseInt(limit),
      offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
    });

    res.json({
      transactions: rows,
      total: count,
      page: Number.parseInt(page),
      totalPages: Math.ceil(count / limit),
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

// POST /api/transactions
router.post("/", auth, upload.single("receipt"), async (req, res) => {
  try {
    const {
      amount,
      description,
      note,
      date,
      type,
      categoryId,
      householdId,
      merchant,
      tags,
      isConfirmed,
      isRecurring,
      recurringInterval,
      recurringDay,
      isPersonal,
      targetHouseholdId,
      splits,
      tip,
    } = req.body;

    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    // recurringDay automatisch aus dem Datum ableiten wenn nicht explizit gesetzt
    const effectiveRecurringDay = recurringDay
      ? Number.parseInt(recurringDay)
      : date
        ? new Date(date).getDate()
        : null;

    // Fälligkeitsdatum berechnen
    let recurringNextDate = null;
    let createImmediateCopy = false;
    if (isRecurring === "true" && date) {
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

    const transaction = await Transaction.create({
      amount: Number.parseFloat(amount),
      description,
      note,
      date: date || new Date(),
      type: type || "expense",
      categoryId,
      householdId,
      userId: req.user.id,
      merchant,
      tags: tags
        ? (() => {
            try {
              return JSON.parse(tags);
            } catch {
              return [];
            }
          })()
        : [],
      receiptImage: req.file ? `/uploads/${req.file.filename}` : null,
      isConfirmed: isConfirmed !== "false",
      isRecurring: isRecurring === "true",
      recurringInterval: isRecurring === "true" ? recurringInterval : null,
      recurringDay: isRecurring === "true" ? effectiveRecurringDay : null,
      recurringNextDate,
      isPersonal: isPersonal === "true" || isPersonal === true,
      targetHouseholdId: type === "transfer" ? targetHouseholdId : null,
      tip: tip ? Number.parseFloat(tip) : 0,
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
        description,
        note,
        date,
        type: type || "expense",
        categoryId,
        householdId,
        userId: req.user.id,
        merchant,
        tags: tags
          ? (() => {
              try {
                return JSON.parse(tags);
              } catch {
                return [];
              }
            })()
          : [],
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
    console.error(err);
    res.status(500).json({ error: "Failed to create transaction" });
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
      tip,
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
