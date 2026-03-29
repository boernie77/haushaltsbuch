const router = require('express').Router();
const { Household, HouseholdMember, User, InviteCode } = require('../models');
const { auth } = require('../middleware/auth');
const crypto = require('crypto');

// GET /api/households — list user's households
router.get('/', auth, async (req, res) => {
  try {
    const memberships = await HouseholdMember.findAll({
      where: { userId: req.user.id },
      include: [{ model: Household }]
    });
    res.json({ households: memberships.map(m => ({ ...m.Household.toJSON(), memberRole: m.role })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch households' });
  }
});

// POST /api/households
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, currency, monthlyBudget, budgetWarningAt, isShared } = req.body;

    const household = await Household.create({
      name, description, currency: currency || 'EUR',
      monthlyBudget, budgetWarningAt: budgetWarningAt || 80,
      isShared: isShared || false,
      adminUserId: req.user.id
    });

    await HouseholdMember.create({ householdId: household.id, userId: req.user.id, role: 'admin' });
    res.status(201).json({ household });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create household' });
  }
});

// PUT /api/households/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const household = await Household.findByPk(req.params.id);
    if (!household) return res.status(404).json({ error: 'Not found' });

    const member = await HouseholdMember.findOne({ where: { householdId: req.params.id, userId: req.user.id } });
    if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { name, description, currency, monthlyBudget, budgetWarningAt, isShared } = req.body;
    await household.update({ name, description, currency, monthlyBudget, budgetWarningAt, isShared });
    res.json({ household });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update household' });
  }
});

// GET /api/households/:id/members
router.get('/:id/members', auth, async (req, res) => {
  try {
    const access = await HouseholdMember.findOne({ where: { householdId: req.params.id, userId: req.user.id } });
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const members = await HouseholdMember.findAll({
      where: { householdId: req.params.id },
      include: [{ model: User, attributes: ['id', 'name', 'email', 'avatar', 'lastLoginAt'] }]
    });
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/households/:id/invite — generate invite link
router.post('/:id/invite', auth, async (req, res) => {
  try {
    const member = await HouseholdMember.findOne({ where: { householdId: req.params.id, userId: req.user.id } });
    if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { role, expiresIn, maxUses } = req.body;
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = expiresIn ? new Date(Date.now() + parseInt(expiresIn) * 3600 * 1000) : null;

    const invite = await InviteCode.create({
      code,
      householdId: req.params.id,
      role: role || 'member',
      createdById: req.user.id,
      expiresAt,
      maxUses: maxUses || 1
    });

    res.status(201).json({ invite, inviteLink: `${process.env.APP_URL}/join/${code}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// DELETE /api/households/:id/members/:userId
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const admin = await HouseholdMember.findOne({ where: { householdId: req.params.id, userId: req.user.id } });
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    await HouseholdMember.destroy({ where: { householdId: req.params.id, userId: req.params.userId } });
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
