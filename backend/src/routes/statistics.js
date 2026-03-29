const router = require('express').Router();
const { Op, fn, col, literal } = require('sequelize');
const { Transaction, Category, HouseholdMember, sequelize } = require('../models');
const { auth } = require('../middleware/auth');

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// GET /api/statistics/monthly?householdId=&year=&month=
router.get('/monthly', auth, async (req, res) => {
  try {
    const { householdId, year, month } = req.query;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);

    const [expenses, income, byCategory] = await Promise.all([
      // Total expenses
      Transaction.sum('amount', {
        where: { householdId, type: 'expense', date: { [Op.between]: [start, end] } }
      }),
      // Total income
      Transaction.sum('amount', {
        where: { householdId, type: 'income', date: { [Op.between]: [start, end] } }
      }),
      // By category
      Transaction.findAll({
        attributes: ['categoryId', [fn('SUM', col('amount')), 'total'], [fn('COUNT', col('Transaction.id')), 'count']],
        where: { householdId, type: 'expense', date: { [Op.between]: [start, end] } },
        include: [{ model: Category, attributes: ['name', 'nameDE', 'icon', 'color'] }],
        group: ['categoryId', 'Category.id'],
        order: [[literal('total'), 'DESC']],
        raw: false
      })
    ]);

    // Daily spending
    const daily = await Transaction.findAll({
      attributes: [
        [fn('DATE', col('date')), 'day'],
        [fn('SUM', col('amount')), 'total']
      ],
      where: { householdId, type: 'expense', date: { [Op.between]: [start, end] } },
      group: [fn('DATE', col('date'))],
      order: [[fn('DATE', col('date')), 'ASC']],
      raw: true
    });

    res.json({
      year: y, month: m,
      totalExpenses: parseFloat(expenses) || 0,
      totalIncome: parseFloat(income) || 0,
      balance: (parseFloat(income) || 0) - (parseFloat(expenses) || 0),
      byCategory: byCategory.map(b => ({
        categoryId: b.categoryId,
        category: b.Category,
        total: parseFloat(b.dataValues.total),
        count: parseInt(b.dataValues.count)
      })),
      dailySpending: daily.map(d => ({ day: d.day, total: parseFloat(d.total) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/statistics/yearly?householdId=&year=
router.get('/yearly', auth, async (req, res) => {
  try {
    const { householdId, year } = req.query;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const y = parseInt(year) || new Date().getFullYear();

    // Monthly breakdown
    const monthly = await Transaction.findAll({
      attributes: [
        [fn('EXTRACT', literal('MONTH FROM date')), 'month'],
        [fn('SUM', col('amount')), 'total'],
        'type'
      ],
      where: {
        householdId,
        date: { [Op.between]: [new Date(y, 0, 1), new Date(y, 11, 31)] }
      },
      group: [fn('EXTRACT', literal('MONTH FROM date')), 'type'],
      order: [[fn('EXTRACT', literal('MONTH FROM date')), 'ASC']],
      raw: true
    });

    // Category totals for year
    const byCategory = await Transaction.findAll({
      attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
      where: {
        householdId, type: 'expense',
        date: { [Op.between]: [new Date(y, 0, 1), new Date(y, 11, 31)] }
      },
      include: [{ model: Category, attributes: ['name', 'nameDE', 'icon', 'color'] }],
      group: ['categoryId', 'Category.id'],
      order: [[literal('total'), 'DESC']],
    });

    // Build monthly chart data
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      expenses: 0,
      income: 0
    }));

    monthly.forEach(m => {
      const idx = parseInt(m.month) - 1;
      if (m.type === 'expense') months[idx].expenses = parseFloat(m.total);
      else months[idx].income = parseFloat(m.total);
    });

    const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
    const totalIncome = months.reduce((s, m) => s + m.income, 0);

    res.json({
      year: y,
      totalExpenses,
      totalIncome,
      balance: totalIncome - totalExpenses,
      monthly: months,
      byCategory: byCategory.map(b => ({
        categoryId: b.categoryId,
        category: b.Category,
        total: parseFloat(b.dataValues.total)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch yearly statistics' });
  }
});

// GET /api/statistics/overview?householdId=
router.get('/overview', auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const now = new Date();
    const thisMonth = { [Op.between]: [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)] };
    const lastMonth = { [Op.between]: [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)] };

    const [thisMonthExp, lastMonthExp, topCategory, recentCount] = await Promise.all([
      Transaction.sum('amount', { where: { householdId, type: 'expense', date: thisMonth } }),
      Transaction.sum('amount', { where: { householdId, type: 'expense', date: lastMonth } }),
      Transaction.findOne({
        attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
        where: { householdId, type: 'expense', date: thisMonth },
        include: [{ model: Category, attributes: ['name', 'nameDE', 'icon', 'color'] }],
        group: ['categoryId', 'Category.id'],
        order: [[literal('total'), 'DESC']],
        limit: 1
      }),
      Transaction.count({ where: { householdId, date: thisMonth } })
    ]);

    const current = parseFloat(thisMonthExp) || 0;
    const previous = parseFloat(lastMonthExp) || 0;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    res.json({
      thisMonth: current,
      lastMonth: previous,
      changePercent: Math.round(change * 10) / 10,
      topCategory: topCategory ? { ...topCategory.Category?.toJSON(), total: parseFloat(topCategory.dataValues.total) } : null,
      transactionCount: recentCount,
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      currentDay: now.getDate()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

module.exports = router;
