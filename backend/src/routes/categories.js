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
    const { name, nameDE, icon, color, householdId, hasSubAccount } = req.body;

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
      hasSubAccount: Boolean(hasSubAccount),
    });
    res.status(201).json({ category });
  } catch (err) {
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// PUT /api/categories/:id — momentan nur hasSubAccount togglen erlaubt.
// System-Kategorien dürfen ebenfalls getoggelt werden, weil "Spesen" etc.
// als Systemkategorie ausgeliefert werden können.
router.put("/:id", auth, async (req, res) => {
  try {
    const { hasSubAccount, householdId } = req.body;
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    // Berechtigung: Zugriff auf den Haushalt (auch bei System-Kategorien,
    // damit sie z.B. für "meinen" Haushalt als Sub-Account aktiviert werden
    // können). hasSubAccount ist aber globaler Schalter — nicht pro Haushalt.
    const checkHouseholdId = householdId || category.householdId;
    if (checkHouseholdId) {
      const access = await HouseholdMember.findOne({
        where: { householdId: checkHouseholdId, userId: req.user.id },
      });
      if (!access) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    if (hasSubAccount !== undefined) {
      await category.update({ hasSubAccount: Boolean(hasSubAccount) });
    }
    res.json({ category });
  } catch (err) {
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
