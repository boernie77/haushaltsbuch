const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User, Household, HouseholdMember, InviteCode } = require('../models');
const { auth } = require('../middleware/auth');
const { seedSystemCategories } = require('../utils/seedCategories');

// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, email, password, inviteCode } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // First user becomes superadmin
    const userCount = await User.count();
    const role = userCount === 0 ? 'superadmin' : 'member';

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashedPassword, role });

    // Handle invite code
    if (inviteCode) {
      const invite = await InviteCode.findOne({
        where: { code: inviteCode, usedById: null }
      });
      if (invite) {
        if (!invite.expiresAt || invite.expiresAt > new Date()) {
          await invite.update({ usedById: user.id, usedAt: new Date(), useCount: invite.useCount + 1 });
          if (invite.householdId) {
            await HouseholdMember.create({
              householdId: invite.householdId,
              userId: user.id,
              role: invite.role
            });
          }
        }
      }
    }

    // First user: create default household
    if (userCount === 0) {
      const household = await Household.create({
        name: `${name}s Haushalt`,
        adminUserId: user.id,
        isShared: false,
      });
      await HouseholdMember.create({ householdId: household.id, userId: user.id, role: 'admin' });
      await seedSystemCategories();
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...userData } = user.toJSON();
    res.status(201).json({ token, user: userData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.isActive) return res.status(403).json({ error: 'Account disabled' });

    await user.update({ lastLoginAt: new Date() });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...userData } = user.toJSON();
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/profile
router.put('/profile', auth, [
  body('name').optional().trim().notEmpty(),
  body('theme').optional().isIn(['feminine', 'masculine']),
], async (req, res) => {
  try {
    const { name, theme } = req.body;
    await req.user.update({ name, theme });
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// PUT /api/auth/password
router.put('/password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!await bcrypt.compare(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }

    await user.update({ password: await bcrypt.hash(newPassword, 12) });
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Password update failed' });
  }
});

module.exports = router;
