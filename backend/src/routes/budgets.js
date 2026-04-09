const router = require("express").Router();
const {
  Budget,
  Transaction,
  Category,
  HouseholdMember,
  Household,
} = require("../models");
const { auth } = require("../middleware/auth");
const { Op, fn, col } = require("sequelize");
const { getMonthBounds } = require("../utils/monthBounds");

// GET /api/budgets?householdId=&month=&year=
router.get("/", auth, async (req, res) => {
  try {
    const { householdId, month, year } = req.query;
    const access = await HouseholdMember.findOne({
      where: { householdId, userId: req.user.id },
    });
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }

    const y = Number.parseInt(year) || new Date().getFullYear();
    const m = Number.parseInt(month) || new Date().getMonth() + 1;

    const [budgets, household] = await Promise.all([
      Budget.findAll({
        where: {
          householdId,
          year: y,
          [Op.or]: [{ month: m }, { month: null }],
        },
        include: [
          {
            model: Category,
            attributes: ["id", "name", "nameDE", "icon", "color"],
          },
        ],
      }),
      Household.findByPk(householdId, { attributes: ["monthStartDay"] }),
    ]);

    // Calculate spending for each budget
    const { start, end } = getMonthBounds(y, m, household?.monthStartDay || 1);

    const result = await Promise.all(
      budgets.map(async (budget) => {
        const where = {
          householdId,
          type: "expense",
          isRecurring: { [Op.ne]: true },
          date: { [Op.between]: [start, end] },
        };
        if (budget.categoryId) {
          where.categoryId = budget.categoryId;
        }

        const spent = (await Transaction.sum("amount", { where })) || 0;
        const percentage = Math.round((spent / budget.limitAmount) * 100);

        return {
          ...budget.toJSON(),
          spent: Number.parseFloat(spent),
          percentage,
          isWarning: percentage >= budget.warningAt,
          isOver: percentage >= 100,
        };
      })
    );

    res.json({ budgets: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

// POST /api/budgets
router.post("/", auth, async (req, res) => {
  try {
    const { householdId, categoryId, limitAmount, month, year, warningAt } =
      req.body;
    const access = await HouseholdMember.findOne({
      where: { householdId, userId: req.user.id },
    });
    if (!access || access.role === "viewer") {
      return res.status(403).json({ error: "Access denied" });
    }

    const budget = await Budget.create({
      householdId,
      categoryId: categoryId || null,
      limitAmount,
      month: month || null,
      year: year || new Date().getFullYear(),
      warningAt: warningAt || 80,
    });
    res.status(201).json({ budget });
  } catch (err) {
    res.status(500).json({ error: "Failed to create budget" });
  }
});

// PUT /api/budgets/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const budget = await Budget.findByPk(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await HouseholdMember.findOne({
      where: { householdId: budget.householdId, userId: req.user.id },
    });
    if (!access || access.role === "viewer") {
      return res.status(403).json({ error: "Access denied" });
    }

    await budget.update(req.body);
    res.json({ budget });
  } catch (err) {
    res.status(500).json({ error: "Failed to update budget" });
  }
});

// DELETE /api/budgets/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const budget = await Budget.findByPk(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await HouseholdMember.findOne({
      where: { householdId: budget.householdId, userId: req.user.id },
    });
    if (!access || access.role === "viewer") {
      return res.status(403).json({ error: "Access denied" });
    }

    await budget.destroy();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete budget" });
  }
});

module.exports = router;
