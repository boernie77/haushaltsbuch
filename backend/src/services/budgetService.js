const { Op, fn, col } = require('sequelize');
const { Transaction, Budget, Household } = require('../models');

/**
 * Check if any budget warning thresholds are reached after a new transaction.
 * Returns warning object or null.
 */
async function checkBudgetWarning(householdId, categoryId, date) {
  try {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);

    const warnings = [];

    // Check category budget
    if (categoryId) {
      const categoryBudget = await Budget.findOne({
        where: {
          householdId, categoryId, year,
          [Op.or]: [{ month }, { month: null }]
        }
      });

      if (categoryBudget) {
        const spent = await Transaction.sum('amount', {
          where: { householdId, categoryId, type: 'expense', date: { [Op.between]: [start, end] } }
        }) || 0;

        const percentage = Math.round((spent / categoryBudget.limitAmount) * 100);
        if (percentage >= categoryBudget.warningAt) {
          warnings.push({
            type: 'category',
            percentage,
            spent: parseFloat(spent),
            limit: parseFloat(categoryBudget.limitAmount),
            isOver: percentage >= 100
          });
        }
      }
    }

    // Check total household budget
    const household = await Household.findByPk(householdId);
    if (household?.monthlyBudget) {
      const totalSpent = await Transaction.sum('amount', {
        where: { householdId, type: 'expense', date: { [Op.between]: [start, end] } }
      }) || 0;

      const percentage = Math.round((totalSpent / household.monthlyBudget) * 100);
      if (percentage >= (household.budgetWarningAt || 80)) {
        warnings.push({
          type: 'household',
          percentage,
          spent: parseFloat(totalSpent),
          limit: parseFloat(household.monthlyBudget),
          isOver: percentage >= 100
        });
      }
    }

    return warnings.length > 0 ? warnings : null;
  } catch (err) {
    console.error('Budget check error:', err);
    return null;
  }
}

module.exports = { checkBudgetWarning };
