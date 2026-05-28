const router = require("express").Router();
const { Op, fn, col, literal } = require("sequelize");
const {
  Transaction,
  Category,
  HouseholdMember,
  User,
  Household,
  sequelize,
} = require("../models");
const { auth } = require("../middleware/auth");
const { getMonthBounds, getPeriodForDate } = require("../utils/monthBounds");

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// Berechnet alle Vorkommen eines Recurring-Templates innerhalb [rangeStart, rangeEnd]
function getOccurrencesInRange(
  nextDate,
  interval,
  recurringDay,
  rangeStart,
  rangeEnd
) {
  if (!(nextDate && interval)) {
    return [];
  }
  const results = [];
  const end = new Date(rangeEnd);
  end.setHours(23, 59, 59, 999);
  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);

  function stepForward(d) {
    const r = new Date(d);
    if (interval === "weekly") {
      r.setDate(r.getDate() + 7);
    } else if (interval === "monthly") {
      r.setDate(1); // setDate(1) VOR setMonth – verhindert JS-Date-Overflow (z.B. März 30 → Feb 30 → März 2)
      r.setMonth(r.getMonth() + 1);
      const maxDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
      r.setDate(Math.min(recurringDay || maxDay, maxDay));
    } else if (interval === "yearly") {
      r.setFullYear(r.getFullYear() + 1);
    } else {
      r.setFullYear(r.getFullYear() + 100);
    }
    return r;
  }

  function stepBack(d) {
    const r = new Date(d);
    if (interval === "weekly") {
      r.setDate(r.getDate() - 7);
    } else if (interval === "monthly") {
      r.setDate(1); // setDate(1) VOR setMonth – verhindert JS-Date-Overflow
      r.setMonth(r.getMonth() - 1);
      const maxDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
      r.setDate(Math.min(recurringDay || maxDay, maxDay));
    } else if (interval === "yearly") {
      r.setFullYear(r.getFullYear() - 1);
    } else {
      r.setFullYear(r.getFullYear() - 100);
    }
    return r;
  }

  // Gehe von nextDate rückwärts bis wir vor rangeStart sind
  let cursor = new Date(nextDate);
  cursor.setHours(0, 0, 0, 0);
  let safetyBack = 0;
  while (cursor >= start && safetyBack++ < 500) {
    cursor = stepBack(cursor);
  }
  // Jetzt vorwärts bis rangeEnd
  cursor = stepForward(cursor);
  let safetyFwd = 0;
  while (cursor <= end && safetyFwd++ < 500) {
    if (cursor >= start) {
      results.push(new Date(cursor));
    }
    cursor = stepForward(cursor);
    if (results.length > 60) {
      break; // Sicherheit
    }
  }
  return results;
}

// GET /api/statistics/monthly?householdId=&year=&month=
router.get("/monthly", auth, async (req, res) => {
  try {
    const { householdId, year, month } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const y = Number.parseInt(year, 10) || new Date().getFullYear();
    const m = Number.parseInt(month, 10) || new Date().getMonth() + 1;

    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const { start, end } = getMonthBounds(y, m, household?.monthStartDay || 1);

    const notRecurring = { isRecurring: { [Op.ne]: true } };
    const [expenses, income, byCategory] = await Promise.all([
      Transaction.sum("amount", {
        where: {
          householdId,
          type: "expense",
          ...notRecurring,
          date: { [Op.between]: [start, end] },
        },
      }),
      Transaction.sum("amount", {
        where: {
          householdId,
          type: "income",
          ...notRecurring,
          date: { [Op.between]: [start, end] },
        },
      }),
      Transaction.findAll({
        attributes: [
          "categoryId",
          [fn("SUM", col("amount")), "total"],
          [fn("COUNT", col("Transaction.id")), "count"],
        ],
        where: {
          householdId,
          type: "expense",
          ...notRecurring,
          date: { [Op.between]: [start, end] },
        },
        include: [
          { model: Category, attributes: ["name", "nameDE", "icon", "color"] },
        ],
        group: ["categoryId", "Category.id"],
        order: [[literal("total"), "DESC"]],
        raw: false,
      }),
    ]);

    const daily = await Transaction.findAll({
      attributes: [
        [fn("DATE", col("date")), "day"],
        [fn("SUM", col("amount")), "total"],
      ],
      where: {
        householdId,
        type: "expense",
        ...notRecurring,
        date: { [Op.between]: [start, end] },
      },
      group: [fn("DATE", col("date"))],
      order: [[fn("DATE", col("date")), "ASC"]],
      raw: true,
    });

    res.json({
      year: y,
      month: m,
      totalExpenses: Number.parseFloat(expenses) || 0,
      totalIncome: Number.parseFloat(income) || 0,
      balance:
        (Number.parseFloat(income) || 0) - (Number.parseFloat(expenses) || 0),
      byCategory: byCategory.map((b) => ({
        categoryId: b.categoryId,
        category: b.Category,
        total: Number.parseFloat(b.dataValues.total),
        count: Number.parseInt(b.dataValues.count, 10),
      })),
      dailySpending: daily.map((d) => ({
        day: d.day,
        total: Number.parseFloat(d.total),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// GET /api/statistics/yearly?householdId=&year=
router.get("/yearly", auth, async (req, res) => {
  try {
    const { householdId, year } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const y = Number.parseInt(year, 10) || new Date().getFullYear();

    // Period-Bounds gemäß monthStartDay (z.B. startDay=27 → Period "April" =
    // 27.03.–26.04.). Statt EXTRACT(MONTH) wird jede Buchung in JS der Period
    // zugeordnet via getPeriodForDate.
    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = household?.monthStartDay || 1;

    // Datumsbereich: gesamter Period-Jahresbereich = von Period-Januar.start
    // bis Period-Dezember.end. Bei startDay > 1 reicht das in das Vorjahr/
    // Folgejahr hinein.
    const janBounds = getMonthBounds(y, 1, startDay);
    const decBounds = getMonthBounds(y, 12, startDay);

    const transactions = await Transaction.findAll({
      attributes: ["amount", "type", "date", "categoryId"],
      where: {
        householdId,
        isRecurring: { [Op.ne]: true },
        type: { [Op.in]: ["expense", "income"] },
        date: { [Op.between]: [janBounds.start, decBounds.end] },
      },
      include: [
        { model: Category, attributes: ["name", "nameDE", "icon", "color"] },
      ],
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      expenses: 0,
      income: 0,
    }));
    const catAgg = new Map(); // categoryId → { total, category }
    for (const t of transactions) {
      const period = getPeriodForDate(t.date, startDay);
      if (period.year !== y) {
        continue; // Period gehört zu einem anderen Jahr
      }
      const amt = Number.parseFloat(t.amount) || 0;
      const idx = period.month - 1;
      if (t.type === "expense") {
        months[idx].expenses += amt;
        const key = t.categoryId || "uncategorized";
        const existing = catAgg.get(key) || { total: 0, category: t.Category };
        existing.total += amt;
        existing.category = t.Category;
        catAgg.set(key, existing);
      } else if (t.type === "income") {
        months[idx].income += amt;
      }
    }

    const byCategory = Array.from(catAgg.entries())
      .map(([categoryId, v]) => ({
        categoryId: categoryId === "uncategorized" ? null : categoryId,
        category: v.category,
        total: Math.round(v.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
    const totalIncome = months.reduce((s, m) => s + m.income, 0);

    res.json({
      year: y,
      totalExpenses,
      totalIncome,
      balance: totalIncome - totalExpenses,
      savingsRate:
        totalIncome > 0
          ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 1000) /
            10
          : 0,
      monthly: months,
      byCategory,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yearly statistics" });
  }
});

// GET /api/statistics/overview?householdId=&month=&year=
router.get("/overview", auth, async (req, res) => {
  try {
    const { householdId, month, year } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const now = new Date();
    const hh = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = hh?.monthStartDay || 1;

    const todayPeriod = getPeriodForDate(now, startDay);
    const curYear = year ? Number.parseInt(year, 10) : todayPeriod.year;
    const curMonth = month ? Number.parseInt(month, 10) : todayPeriod.month;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const isCurrentPeriod =
      curYear === todayPeriod.year && curMonth === todayPeriod.month;

    const { start: curStart, end: curEnd } = getMonthBounds(
      curYear,
      curMonth,
      startDay
    );
    const { start: prevStart, end: prevEnd } = getMonthBounds(
      prevYear,
      prevMonth,
      startDay
    );

    const thisMonthRange = { [Op.between]: [curStart, curEnd] };
    const lastMonthRange = { [Op.between]: [prevStart, prevEnd] };

    const nr = { isRecurring: { [Op.ne]: true } };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      thisMonthExp,
      lastMonthExp,
      thisMonthInc,
      lastMonthInc,
      topCategory,
      recentCount,
      recurringTemplates,
    ] = await Promise.all([
      Transaction.sum("amount", {
        where: { householdId, type: "expense", ...nr, date: thisMonthRange },
      }),
      Transaction.sum("amount", {
        where: { householdId, type: "expense", ...nr, date: lastMonthRange },
      }),
      Transaction.sum("amount", {
        where: { householdId, type: "income", ...nr, date: thisMonthRange },
      }),
      Transaction.sum("amount", {
        where: { householdId, type: "income", ...nr, date: lastMonthRange },
      }),
      Transaction.findOne({
        attributes: ["categoryId", [fn("SUM", col("amount")), "total"]],
        where: {
          householdId,
          type: "expense",
          ...nr,
          date: thisMonthRange,
          recurringSourceId: { [Op.is]: null },
        },
        include: [
          {
            model: Category,
            attributes: ["name", "nameDE", "icon", "color"],
          },
        ],
        group: ["categoryId", "Category.id"],
        order: [[literal("total"), "DESC"]],
        limit: 1,
      }),
      Transaction.count({
        where: { householdId, ...nr, date: thisMonthRange },
      }),
      Transaction.findAll({
        where: { householdId, isRecurring: true, type: "expense" },
        attributes: [
          "amount",
          "recurringInterval",
          "recurringDay",
          "recurringNextDate",
        ],
      }),
    ]);

    const current = Number.parseFloat(thisMonthExp) || 0;
    const previous = Number.parseFloat(lastMonthExp) || 0;
    const income = Number.parseFloat(thisMonthInc) || 0;
    const previousIncome = Number.parseFloat(lastMonthInc) || 0;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const daysInMonth =
      Math.floor((curEnd - curStart) / (1000 * 60 * 60 * 24)) + 1;
    const currentDay = isCurrentPeriod
      ? Math.max(1, Math.floor((now - curStart) / (1000 * 60 * 60 * 24)) + 1)
      : daysInMonth;
    let fixedAlreadyPaid = 0;
    let fixedYetToCome = 0;
    if (isCurrentPeriod) {
      for (const t of recurringTemplates) {
        if (!(t.recurringNextDate && t.recurringInterval)) {
          continue;
        }
        const occurrences = getOccurrencesInRange(
          t.recurringNextDate,
          t.recurringInterval,
          t.recurringDay,
          curStart,
          curEnd
        );
        for (const d of occurrences) {
          if (d <= today) {
            fixedAlreadyPaid += Number.parseFloat(t.amount);
          } else {
            fixedYetToCome += Number.parseFloat(t.amount);
          }
        }
      }
    }

    // Prognose nur für laufenden Monat — abgeschlossene Monate brauchen keine Hochrechnung
    let projectedExpenses = current;
    if (isCurrentPeriod) {
      const variableSoFar = Math.max(0, current - fixedAlreadyPaid);
      const projectedVariable =
        currentDay > 0 ? (variableSoFar / currentDay) * daysInMonth : 0;
      projectedExpenses = projectedVariable + fixedAlreadyPaid + fixedYetToCome;
    }

    res.json({
      thisMonth: current,
      thisMonthIncome: income,
      balance: income - current,
      savingsRate:
        income > 0 ? Math.round(((income - current) / income) * 1000) / 10 : 0,
      lastMonth: previous,
      lastMonthIncome: previousIncome,
      changePercent: Math.round(change * 10) / 10,
      topCategory: topCategory
        ? {
            ...topCategory.Category?.toJSON(),
            total: Number.parseFloat(topCategory.dataValues.total),
          }
        : null,
      transactionCount: recentCount,
      daysInMonth,
      currentDay,
      isCurrentPeriod,
      year: curYear,
      month: curMonth,
      projectedExpenses: Math.round(projectedExpenses * 100) / 100,
      projectedRemaining: Math.round((income - projectedExpenses) * 100) / 100,
      fixedMonthly: Math.round((fixedAlreadyPaid + fixedYetToCome) * 100) / 100,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

// GET /api/statistics/trends?householdId=&months=3|6|12
router.get("/trends", auth, async (req, res) => {
  try {
    const { householdId, months = 6 } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const n = Number.parseInt(months, 10);
    // Period-aware "letzte n Monate": Start = Beginn der Period vor n
    // Monaten gemäß monthStartDay. Bei startDay=1 entspricht das dem
    // bisherigen Verhalten (1. des Vormonats).
    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = household?.monthStartDay || 1;
    const currentPeriod = getPeriodForDate(new Date(), startDay);
    let sinceYear = currentPeriod.year;
    let sinceMonth = currentPeriod.month - n;
    while (sinceMonth < 1) {
      sinceMonth += 12;
      sinceYear -= 1;
    }
    const { start: since } = getMonthBounds(sinceYear, sinceMonth, startDay);

    const [byCategory, totals] = await Promise.all([
      Transaction.findAll({
        attributes: [
          "categoryId",
          [fn("SUM", col("amount")), "total"],
          [fn("COUNT", col("Transaction.id")), "count"],
        ],
        where: {
          householdId,
          type: "expense",
          isRecurring: { [Op.ne]: true },
          date: { [Op.gte]: since },
        },
        include: [
          { model: Category, attributes: ["name", "nameDE", "icon", "color"] },
        ],
        group: ["categoryId", "Category.id"],
        order: [[literal("total"), "DESC"]],
      }),
      Promise.all([
        Transaction.sum("amount", {
          where: {
            householdId,
            type: "expense",
            isRecurring: { [Op.ne]: true },
            date: { [Op.gte]: since },
          },
        }),
        Transaction.sum("amount", {
          where: {
            householdId,
            type: "income",
            isRecurring: { [Op.ne]: true },
            date: { [Op.gte]: since },
          },
        }),
      ]),
    ]);

    const totalExp = Number.parseFloat(totals[0]) || 0;
    const totalInc = Number.parseFloat(totals[1]) || 0;

    res.json({
      months: n,
      totalExpenses: totalExp,
      totalIncome: totalInc,
      savingsRate:
        totalInc > 0
          ? Math.round(((totalInc - totalExp) / totalInc) * 1000) / 10
          : 0,
      avgMonthlyExpenses: Math.round((totalExp / n) * 100) / 100,
      avgMonthlyIncome: Math.round((totalInc / n) * 100) / 100,
      byCategory: byCategory.map((b) => ({
        categoryId: b.categoryId,
        category: b.Category,
        total: Number.parseFloat(b.dataValues.total),
        avg:
          Math.round((Number.parseFloat(b.dataValues.total) / n) * 100) / 100,
        count: Number.parseInt(b.dataValues.count, 10),
        share:
          totalExp > 0
            ? Math.round(
                (Number.parseFloat(b.dataValues.total) / totalExp) * 1000
              ) / 10
            : 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trends" });
  }
});

// GET /api/statistics/wealth?householdId=
router.get("/wealth", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Period-Bounds gemäß monthStartDay: Buchungen werden in JS dem Period-
    // Label zugeordnet, nicht via EXTRACT(MONTH). So stimmt der Vermögens-
    // verlauf mit dem Period-Schema des Haushaltsbuchs überein.
    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = household?.monthStartDay || 1;

    const rows = await Transaction.findAll({
      attributes: ["amount", "type", "date"],
      where: {
        householdId,
        type: { [Op.in]: ["expense", "income"] },
        isRecurring: { [Op.ne]: true },
      },
      raw: true,
    });

    // Aggregation: (year, month) → balance
    const agg = new Map();
    for (const r of rows) {
      const period = getPeriodForDate(r.date, startDay);
      const key = `${period.year}-${period.month}`;
      const amt = Number.parseFloat(r.amount) || 0;
      const delta = r.type === "income" ? amt : -amt;
      agg.set(key, (agg.get(key) || 0) + delta);
    }

    // Sortiert nach (year, month) ASC
    const entries = Array.from(agg.entries())
      .map(([key, balance]) => {
        const [y, m] = key.split("-").map(Number);
        return { year: y, month: m, balance };
      })
      .sort((a, b) => a.year - b.year || a.month - b.month);

    let cumulative = 0;
    const data = entries.map((e) => {
      cumulative += e.balance;
      return {
        year: e.year,
        month: e.month,
        balance: Math.round(e.balance * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
        label: `${String(e.month).padStart(2, "0")}/${e.year}`,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch wealth data" });
  }
});

// GET /api/statistics/by-person?householdId=&month=&year=
router.get("/by-person", auth, async (req, res) => {
  try {
    const { householdId, month, year } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const y = Number.parseInt(year, 10) || new Date().getFullYear();
    const m = Number.parseInt(month, 10) || new Date().getMonth() + 1;
    const hhPerson = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const { start, end } = getMonthBounds(y, m, hhPerson?.monthStartDay || 1);

    const rows = await Transaction.findAll({
      attributes: [
        "userId",
        [fn("SUM", col("amount")), "total"],
        [fn("COUNT", col("Transaction.id")), "count"],
      ],
      where: {
        householdId,
        type: "expense",
        isPersonal: false,
        isRecurring: { [Op.ne]: true },
        date: { [Op.between]: [start, end] },
      },
      include: [{ model: User, attributes: ["id", "name", "avatar"] }],
      group: ["userId", "User.id"],
      order: [[literal("total"), "DESC"]],
    });

    const total = rows.reduce(
      (s, r) => s + Number.parseFloat(r.dataValues.total),
      0
    );
    const persons = rows.map((r) => ({
      userId: r.userId,
      user: r.User,
      total: Number.parseFloat(r.dataValues.total),
      count: Number.parseInt(r.dataValues.count, 10),
      share:
        total > 0
          ? Math.round((Number.parseFloat(r.dataValues.total) / total) * 1000) /
            10
          : 0,
    }));

    // Settlement calculation
    const n = persons.length;
    const avg = n > 0 ? total / n : 0;
    const balances = persons.map((p) => ({ ...p, diff: p.total - avg }));
    const creditors = balances
      .filter((p) => p.diff > 0.01)
      .sort((a, b) => b.diff - a.diff);
    const debtors = balances
      .filter((p) => p.diff < -0.01)
      .sort((a, b) => a.diff - b.diff);

    const settlements = [];
    let ci = 0,
      di = 0;
    const cred = creditors.map((c) => ({ ...c, rem: c.diff }));
    const debt = debtors.map((d) => ({ ...d, rem: Math.abs(d.diff) }));
    while (ci < cred.length && di < debt.length) {
      const amount = Math.min(cred[ci].rem, debt[di].rem);
      if (amount > 0.01) {
        settlements.push({
          from: debt[di].user,
          to: cred[ci].user,
          amount: Math.round(amount * 100) / 100,
        });
      }
      cred[ci].rem -= amount;
      debt[di].rem -= amount;
      if (cred[ci].rem < 0.01) {
        ci++;
      }
      if (debt[di].rem < 0.01) {
        di++;
      }
    }

    res.json({
      year: y,
      month: m,
      total,
      avg: Math.round(avg * 100) / 100,
      persons,
      settlements,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch person statistics" });
  }
});

// GET /api/statistics/fixed-balance?householdId=
// Liefert alle persistierten Monats-Snapshots des "festen Saldos" + Live-Wert
// für den aktuellen Monat. Snapshots werden vom Cron (1. jeden Monats 02:00)
// erstellt; der aktuelle Monat ist nur eine Hochrechnung aus den aktiven
// wiederkehrenden Buchungen und wird beim nächsten Cron-Lauf eingefroren.
router.get("/fixed-balance", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { MonthlyFixedSnapshot } = require("../models");
    const { computeFixedBalance } = require("../services/fixedBalanceService");

    const snapshots = await MonthlyFixedSnapshot.findAll({
      where: { householdId },
      order: [
        ["year", "ASC"],
        ["month", "ASC"],
      ],
    });

    // Aktuelle Period gemäß monthStartDay (z.B. 27.03. → "April")
    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = household?.monthStartDay || 1;
    const period = getPeriodForDate(new Date(), startDay);
    const current = await computeFixedBalance(householdId);

    res.json({
      snapshots: snapshots.map((s) => ({
        year: s.year,
        month: s.month,
        fixedIncome: Number(s.fixedIncome),
        fixedExpenses: Number(s.fixedExpenses),
        balance: Number(s.balance),
      })),
      current: {
        year: period.year,
        month: period.month,
        ...current,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixed balance" });
  }
});

// POST /api/statistics/fixed-balance/snapshot?householdId=
// Manuelles Erstellen/Aktualisieren des Snapshots für aktuellen oder
// angegebenen Monat. Nützlich für Backfill und sofortiges Festhalten.
router.post("/fixed-balance/snapshot", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { upsertSnapshot } = require("../services/fixedBalanceService");
    const household = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = household?.monthStartDay || 1;
    const period = getPeriodForDate(new Date(), startDay);
    const year = Number.parseInt(req.body.year, 10) || period.year;
    const month = Number.parseInt(req.body.month, 10) || period.month;
    const snap = await upsertSnapshot(householdId, year, month);
    res.json({
      year: snap.year,
      month: snap.month,
      fixedIncome: Number(snap.fixedIncome),
      fixedExpenses: Number(snap.fixedExpenses),
      balance: Number(snap.balance),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
