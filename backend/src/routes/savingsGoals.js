const router = require("express").Router();
const { SavingsGoal, HouseholdMember } = require("../models");
const { auth } = require("../middleware/auth");

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// GET /api/savings-goals?householdId=
router.get("/", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const goals = await SavingsGoal.findAll({
      where: { householdId },
      order: [["createdAt", "ASC"]],
    });
    res.json({ goals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch savings goals" });
  }
});

// POST /api/savings-goals
router.post("/", auth, async (req, res) => {
  try {
    const {
      householdId,
      name,
      targetAmount,
      savedAmount,
      targetDate,
      icon,
      color,
    } = req.body;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const goal = await SavingsGoal.create({
      householdId,
      name,
      targetAmount,
      savedAmount: savedAmount || 0,
      targetDate: targetDate || null,
      icon: icon || "🎯",
      color: color || "#E91E8C",
    });
    res.status(201).json({ goal });
  } catch (err) {
    res.status(500).json({ error: "Failed to create savings goal" });
  }
});

// PUT /api/savings-goals/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const goal = await SavingsGoal.findByPk(req.params.id);
    if (!goal) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!(await checkAccess(req.user.id, goal.householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const {
      name,
      targetAmount,
      savedAmount,
      targetDate,
      icon,
      color,
      isCompleted,
    } = req.body;
    await goal.update({
      name,
      targetAmount,
      savedAmount,
      targetDate,
      icon,
      color,
      isCompleted,
    });
    // Auto-complete when target reached
    if (
      Number.parseFloat(goal.savedAmount) >=
        Number.parseFloat(goal.targetAmount) &&
      !goal.isCompleted
    ) {
      await goal.update({ isCompleted: true });
    }
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ error: "Failed to update savings goal" });
  }
});

// DELETE /api/savings-goals/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const goal = await SavingsGoal.findByPk(req.params.id);
    if (!goal) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!(await checkAccess(req.user.id, goal.householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    await goal.destroy();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete savings goal" });
  }
});

module.exports = router;
