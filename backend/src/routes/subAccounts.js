// Sub-Account-Routen für Sammelkonten-Kategorien (z.B. Spesen).
// - GET /api/sub-accounts?householdId=
//     → Liste aller hasSubAccount-Kategorien mit allen offenen/geschlossenen
//       Perioden + jeweiligen Salden + Settlement-Status.
// - POST /api/sub-accounts/:categoryId/settle
//     → Schließt eine Period: erzeugt Settlement-Buchung (affects=false,
//       excludeFromStats=false) und schreibt Audit-Eintrag.
const router = require("express").Router();
const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
const {
  sequelize,
  Category,
  Transaction,
  HouseholdMember,
  SubAccountSettlement,
} = require("../models");
const { auth } = require("../middleware/auth");

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// Sammelt alle Periods (year/month-Paare), in denen für eine Kategorie
// schon Buchungen existieren — unabhängig vom Settlement-Status. Gibt
// auch leere Perioden zurück, in denen es bisher nur Settlements gibt
// (theoretisch nicht vorgesehen, aber defensiv).
async function aggregatePeriods(householdId, categoryId) {
  const rows = await Transaction.findAll({
    attributes: [
      "subAccountPeriodYear",
      "subAccountPeriodMonth",
      "type",
      [sequelize.fn("SUM", sequelize.col("amount")), "total"],
    ],
    where: {
      householdId,
      categoryId,
      subAccountPeriodMonth: { [Op.ne]: null },
      isSubAccountSettlement: { [Op.ne]: true },
    },
    group: ["subAccountPeriodYear", "subAccountPeriodMonth", "type"],
    raw: true,
  });
  const periodMap = new Map();
  for (const r of rows) {
    const key = `${r.subAccountPeriodYear}-${r.subAccountPeriodMonth}`;
    const entry = periodMap.get(key) || {
      year: r.subAccountPeriodYear,
      month: r.subAccountPeriodMonth,
      income: 0,
      expense: 0,
    };
    if (r.type === "income") {
      entry.income += Number.parseFloat(r.total) || 0;
    } else if (r.type === "expense") {
      entry.expense += Number.parseFloat(r.total) || 0;
    }
    periodMap.set(key, entry);
  }
  const settlements = await SubAccountSettlement.findAll({
    where: { householdId, categoryId },
    raw: true,
  });
  for (const s of settlements) {
    const key = `${s.year}-${s.month}`;
    const entry = periodMap.get(key) || {
      year: s.year,
      month: s.month,
      income: 0,
      expense: 0,
    };
    entry.settledAt = s.settledAt;
    entry.settlementTransactionId = s.settlementTransactionId;
    entry.settledBalance = Number.parseFloat(s.balance);
    periodMap.set(key, entry);
  }
  return Array.from(periodMap.values())
    .map((p) => ({
      year: p.year,
      month: p.month,
      income: Math.round(p.income * 100) / 100,
      expense: Math.round(p.expense * 100) / 100,
      balance: Math.round((p.income - p.expense) * 100) / 100,
      settledAt: p.settledAt || null,
      settlementTransactionId: p.settlementTransactionId || null,
      settledBalance: p.settledBalance ?? null,
    }))
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

// GET /api/sub-accounts?householdId=
router.get("/", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // hasSubAccount kann sowohl auf Haushaltskategorien als auch auf System-
    // Kategorien (householdId IS NULL) gesetzt sein.
    const categories = await Category.findAll({
      where: {
        hasSubAccount: true,
        [Op.or]: [{ householdId }, { householdId: null }],
      },
      order: [["name", "ASC"]],
    });
    const enriched = await Promise.all(
      categories.map(async (c) => ({
        category: {
          id: c.id,
          name: c.name,
          nameDE: c.nameDE,
          icon: c.icon,
          color: c.color,
          isSystem: c.isSystem,
        },
        periods: await aggregatePeriods(householdId, c.id),
      }))
    );
    res.json({ subAccounts: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/sub-accounts/:categoryId/settle
// Body: { householdId, year, month, accountId? }
// Schließt eine Period: erzeugt Settlement-Buchung mit affectsAccountBalance=
// false und excludeFromStats=false. Saldo positiv → income, negativ → expense.
router.post("/:categoryId/settle", auth, async (req, res) => {
  try {
    const { householdId, year, month, accountId } = req.body;
    if (!(householdId && year && month)) {
      return res
        .status(400)
        .json({ error: "householdId, year, month required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const category = await Category.findByPk(req.params.categoryId);
    if (!category?.hasSubAccount) {
      return res.status(400).json({ error: "Kategorie hat kein Sub-Konto" });
    }

    // Bereits geschlossen?
    const existing = await SubAccountSettlement.findOne({
      where: { householdId, categoryId: category.id, year, month },
    });
    if (existing) {
      return res
        .status(400)
        .json({ error: "Diese Period wurde bereits geschlossen" });
    }

    const [incomeSum, expenseSum] = await Promise.all([
      Transaction.sum("amount", {
        where: {
          householdId,
          categoryId: category.id,
          type: "income",
          subAccountPeriodYear: year,
          subAccountPeriodMonth: month,
          isSubAccountSettlement: { [Op.ne]: true },
        },
      }),
      Transaction.sum("amount", {
        where: {
          householdId,
          categoryId: category.id,
          type: "expense",
          subAccountPeriodYear: year,
          subAccountPeriodMonth: month,
          isSubAccountSettlement: { [Op.ne]: true },
        },
      }),
    ]);
    const balance =
      (Number.parseFloat(incomeSum) || 0) -
      (Number.parseFloat(expenseSum) || 0);

    const tx = await sequelize.transaction();
    try {
      let settlementTransactionId = null;
      if (Math.abs(balance) >= 0.005) {
        // Settlement-Buchung erzeugen (virtuell: affects=false). Datum ist
        // der letzte Tag der Period — semantisch "rückwirkend in die
        // geschlossene Period eingerechnet". Period-Datum wird hier
        // bewusst NICHT über monthBounds gerechnet, weil Settlement
        // tagaktuell in der Statistik landen soll.
        const settlementDate = new Date();
        const settlement = await Transaction.create(
          {
            amount: Math.abs(balance),
            description: `Abschluss ${category.nameDE || category.name} ${String(month).padStart(2, "0")}/${year}`,
            date: settlementDate,
            type: balance >= 0 ? "income" : "expense",
            categoryId: category.id,
            householdId,
            userId: req.user.id,
            isConfirmed: true,
            isRecurring: false,
            excludeFromStats: false,
            isSubAccountSettlement: true,
            affectsAccountBalance: false,
            accountId: accountId || null,
          },
          { transaction: tx }
        );
        settlementTransactionId = settlement.id;
      }
      const auditId = randomUUID();
      const now = new Date();
      await SubAccountSettlement.create(
        {
          id: auditId,
          householdId,
          categoryId: category.id,
          year,
          month,
          settlementTransactionId,
          balance: Math.round(balance * 100) / 100,
          settledByUserId: req.user.id,
          settledAt: now,
        },
        { transaction: tx }
      );
      await tx.commit();
      res.json({
        balance: Math.round(balance * 100) / 100,
        settlementTransactionId,
      });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/sub-accounts/:categoryId/backfill
// Body: { householdId }
// Ordnet ALLE bestehenden Buchungen dieser Kategorie nachträglich dem Sub-
// Konto zu: Period wird aus dem Buchungs-Datum abgeleitet
// (getPeriodForDate(date, monthStartDay)). excludeFromStats=true wird gesetzt.
// Bereits zugeordnete Buchungen (subAccountPeriodMonth IS NOT NULL) und
// Settlement-Buchungen werden übersprungen.
router.post("/:categoryId/backfill", auth, async (req, res) => {
  try {
    const { householdId } = req.body;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const category = await Category.findByPk(req.params.categoryId);
    if (!category?.hasSubAccount) {
      return res.status(400).json({ error: "Kategorie hat kein Sub-Konto" });
    }

    const { Household } = require("../models");
    const { getPeriodForDate } = require("../utils/monthBounds");
    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = household?.monthStartDay || 1;

    const candidates = await Transaction.findAll({
      where: {
        householdId,
        categoryId: category.id,
        isSubAccountSettlement: { [Op.ne]: true },
        subAccountPeriodMonth: null,
      },
      attributes: ["id", "date"],
    });

    let updated = 0;
    const tx = await sequelize.transaction();
    try {
      for (const t of candidates) {
        const period = getPeriodForDate(t.date, startDay);
        await Transaction.update(
          {
            subAccountPeriodMonth: period.month,
            subAccountPeriodYear: period.year,
            excludeFromStats: true,
          },
          { where: { id: t.id }, transaction: tx }
        );
        updated++;
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    res.json({ updated, total: candidates.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// DELETE /api/sub-accounts/:categoryId/settle?year=&month=&householdId=
// Macht ein Schließen rückgängig (löscht Settlement + Audit-Eintrag).
router.delete("/:categoryId/settle", auth, async (req, res) => {
  try {
    const { householdId, year, month } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const settlement = await SubAccountSettlement.findOne({
      where: {
        householdId,
        categoryId: req.params.categoryId,
        year: Number.parseInt(year, 10),
        month: Number.parseInt(month, 10),
      },
    });
    if (!settlement) {
      return res.status(404).json({ error: "Settlement nicht gefunden" });
    }
    const tx = await sequelize.transaction();
    try {
      if (settlement.settlementTransactionId) {
        await Transaction.destroy({
          where: { id: settlement.settlementTransactionId },
          transaction: tx,
        });
      }
      await settlement.destroy({ transaction: tx });
      await tx.commit();
      res.json({ success: true });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
