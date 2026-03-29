const router = require('express').Router();
const { User, Household, HouseholdMember, Transaction, InviteCode } = require('../models');
const { auth, adminGuard, superAdminGuard } = require('../middleware/auth');
const { fn, col } = require('sequelize');

// GET /api/admin/stats
router.get('/stats', auth, superAdminGuard, async (req, res) => {
  try {
    const [userCount, householdCount, transactionCount] = await Promise.all([
      User.count(),
      Household.count(),
      Transaction.count()
    ]);

    const recentUsers = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    res.json({ userCount, householdCount, transactionCount, recentUsers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users
router.get('/users', auth, superAdminGuard, async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const where = {};
    if (search) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({ users: rows, total: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', auth, superAdminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    const { name, role, isActive } = req.body;
    await user.update({ name, role, isActive });
    const { password: _, ...userData } = user.toJSON();
    res.json({ user: userData });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', auth, superAdminGuard, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await User.destroy({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/households
router.get('/households', auth, superAdminGuard, async (req, res) => {
  try {
    const households = await Household.findAll({
      include: [{ model: HouseholdMember, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ households });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch households' });
  }
});

// POST /api/admin/invite-codes
router.post('/invite-codes', auth, superAdminGuard, async (req, res) => {
  try {
    const crypto = require('crypto');
    const { role, maxUses, expiresIn } = req.body;
    const code = 'HB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const expiresAt = expiresIn ? new Date(Date.now() + parseInt(expiresIn) * 3600 * 1000) : null;

    const invite = await InviteCode.create({
      code, role: role || 'member', maxUses: maxUses || 100,
      createdById: req.user.id, expiresAt
    });
    res.status(201).json({ invite });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invite code' });
  }
});

// GET /api/admin/invite-codes
router.get('/invite-codes', auth, superAdminGuard, async (req, res) => {
  try {
    const codes = await InviteCode.findAll({
      include: [
        { model: User, as: 'creator', foreignKey: 'createdById', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ codes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invite codes' });
  }
});

module.exports = router;
