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

    const monthly = await Transaction.findAll({
      attributes: [
        [fn("EXTRACT", literal("MONTH FROM date")), "month"],
        [fn("SUM", col("amount")), "total"],
        "type",
      ],
      where: {
        householdId,
        isRecurring: { [Op.ne]: true },
        date: { [Op.between]: [new Date(y, 0, 1), new Date(y, 11, 31)] },
      },
      group: [fn("EXTRACT", literal("MONTH FROM date")), "type"],
      order: [[fn("EXTRACT", literal("MONTH FROM date")), "ASC"]],
      raw: true,
    });

    const byCategory = await Transaction.findAll({
      attributes: ["categoryId", [fn("SUM", col("amount")), "total"]],
      where: {
        householdId,
        type: "expense",
        isRecurring: { [Op.ne]: true },
        date: { [Op.between]: [new Date(y, 0, 1), new Date(y, 11, 31)] },
      },
      include: [
        { model: Category, attributes: ["name", "nameDE", "icon", "color"] },
      ],
      group: ["categoryId", "Category.id"],
      order: [[literal("total"), "DESC"]],
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      expenses: 0,
      income: 0,
    }));
    monthly.forEach((m) => {
      const idx = Number.parseInt(m.month, 10) - 1;
      if (m.type === "expense") {
        months[idx].expenses = Number.parseFloat(m.total);
      } else if (m.type === "income") {
        months[idx].income = Number.parseFloat(m.total);
      }
    });

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
      byCategory: byCategory.map((b) => ({
        categoryId: b.categoryId,
        category: b.Category,
        total: Number.parseFloat(b.dataValues.total),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch yearly statistics" });
  }
});

// GET /api/statistics/overview?householdId=
router.get("/overview", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const now = new Date();
    const hh = await Household.findByPk(householdId, {
      attributes: ["monthStartDay"],
    });
    const startDay = hh?.monthStartDay || 1;

    const { year: curYear, month: curMonth } = getPeriodForDate(now, startDay);
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;

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
    const [thisMonthExp, lastMonthExp, thisMonthInc, topCategory, recentCount] =
      await Promise.all([
        Transaction.sum("amount", {
          where: { householdId, type: "expense", ...nr, date: thisMonthRange },
        }),
        Transaction.sum("amount", {
          where: { householdId, type: "expense", ...nr, date: lastMonthRange },
        }),
        Transaction.sum("amount", {
          where: { householdId, type: "income", ...nr, date: thisMonthRange },
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
      ]);

    const current = Number.parseFloat(thisMonthExp) || 0;
    const previous = Number.parseFloat(lastMonthExp) || 0;
    const income = Number.parseFloat(thisMonthInc) || 0;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const daysInMonth =
      Math.floor((curEnd - curStart) / (1000 * 60 * 60 * 24)) + 1;
    const currentDay = Math.max(
      1,
      Math.floor((now - curStart) / (1000 * 60 * 60 * 24)) + 1
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fixkosten (Wiederkehrende Buchungen): separat behandeln, nicht linear hochrechnen
    const recurringTemplates = await Transaction.findAll({
      where: { householdId, isRecurring: true, type: "expense" },
      attributes: [
        "amount",
        "recurringInterval",
        "recurringDay",
        "recurringNextDate",
      ],
    });
    let fixedAlreadyPaid = 0;
    let fixedYetToCome = 0;
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

    // Variable Ausgaben = aktuelle Ausgaben abzüglich bereits gebuchter Fixkosten
    const variableSoFar = Math.max(0, current - fixedAlreadyPaid);
    const projectedVariable =
      currentDay > 0 ? (variableSoFar / currentDay) * daysInMonth : 0;
    const projectedExpenses =
      projectedVariable + fixedAlreadyPaid + fixedYetToCome;

    res.json({
      thisMonth: current,
      thisMonthIncome: income,
      balance: income - current,
      savingsRate:
        income > 0 ? Math.round(((income - current) / income) * 1000) / 10 : 0,
      lastMonth: previous,
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
    const since = new Date();
    since.setMonth(since.getMonth() - n);
    since.setDate(1);

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

    const rows = await sequelize.query(
      `
      SELECT
        EXTRACT(YEAR FROM date)::int AS year,
        EXTRACT(MONTH FROM date)::int AS month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) -
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS balance
      FROM transactions
      WHERE "householdId" = :householdId AND type IN ('expense','income') AND "isRecurring" IS NOT TRUE
      GROUP BY year, month
      ORDER BY year, month
    `,
      { replacements: { householdId }, type: "SELECT" }
    );

    let cumulative = 0;
    const data = rows.map((r) => {
      cumulative += Number.parseFloat(r.balance);
      return {
        year: r.year,
        month: r.month,
        balance: Math.round(Number.parseFloat(r.balance) * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
        label: `${String(r.month).padStart(2, "0")}/${r.year}`,
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

module.exports = router;
