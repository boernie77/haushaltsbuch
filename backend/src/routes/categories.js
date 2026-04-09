const router = require("express").Router();
const { Category, HouseholdMember } = require("../models");
const { auth } = require("../middleware/auth");

// GET /api/categories?householdId=
router.get("/", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    const { Op } = require("sequelize");

    const where = householdId
      ? { [Op.or]: [{ householdId }, { householdId: null, isSystem: true }] }
      : { isSystem: true };

    const categories = await Category.findAll({
      where,
      order: [
        ["sortOrder", "ASC"],
        ["name", "ASC"],
      ],
    });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// POST /api/categories — custom household category
router.post("/", auth, async (req, res) => {
  try {
    const { name, nameDE, icon, color, householdId } = req.body;

    if (householdId) {
      const access = await HouseholdMember.findOne({
        where: { householdId, userId: req.user.id },
      });
      if (!access) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const category = await Category.create({
      name,
      nameDE,
      icon,
      color,
      isSystem: false,
      householdId,
    });
    res.status(201).json({ category });
  } catch (err) {
    res.status(500).json({ error: "Failed to create category" });
  }
});

module.exports = router;
