const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { User, Household, HouseholdMember, InviteCode, sequelize } = require('../models');
const { auth } = require('../middleware/auth');
const { seedSystemCategories } = require('../utils/seedCategories');

function getMailer() {
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

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

    if (await User.findOne({ where: { email } })) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const userCount = await User.count();
    const isFirst = userCount === 0;

    // All users except the first require a valid invite code
    let invite = null;
    if (!isFirst) {
      if (!inviteCode) {
        return res.status(400).json({ error: 'invite_required', message: 'Ein Einladungscode ist erforderlich.' });
      }
      invite = await InviteCode.findOne({ where: { code: inviteCode } });
      if (!invite || invite.useCount >= invite.maxUses || (invite.expiresAt && invite.expiresAt < new Date())) {
        return res.status(400).json({ error: 'invalid_invite', message: 'Ungültiger oder abgelaufener Einladungscode.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashedPassword, role: isFirst ? 'superadmin' : 'member' });

    if (isFirst) {
      // First user: superadmin with their own household
      const household = await Household.create({ name: `${name}s Haushalt`, adminUserId: user.id, isShared: false });
      await HouseholdMember.create({ householdId: household.id, userId: user.id, role: 'admin' });
      await seedSystemCategories();
    } else {
      // Mark invite as used
      await invite.update({ useCount: invite.useCount + 1, usedById: user.id, usedAt: new Date() });

      if (invite.type === 'new_household' || !invite.householdId) {
        // Admin invite: registrant gets their own new household and becomes its admin
        const household = await Household.create({ name: `${name}s Haushalt`, adminUserId: user.id, isShared: false });
        await HouseholdMember.create({ householdId: household.id, userId: user.id, role: 'admin' });
      } else {
        // Household invite: registrant joins the specific household
        await HouseholdMember.create({ householdId: invite.householdId, userId: user.id, role: invite.role });
      }
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

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  // Always return 200 to prevent user enumeration
  res.json({ message: 'Falls ein Konto existiert, wurde eine E-Mail gesendet.' });
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return;
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return;

    const mailer = getMailer();
    if (!mailer) {
      console.warn('[auth] SMTP nicht konfiguriert — Passwort-Reset-E-Mail konnte nicht gesendet werden');
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await sequelize.query(
      `INSERT INTO password_reset_tokens ("userId", token, "expiresAt", "createdAt") VALUES (:userId, :token, :expiresAt, NOW())`,
      { replacements: { userId: user.id, token, expiresAt } }
    );

    const resetUrl = `${process.env.APP_URL || 'https://haushalt.bernauer24.com'}/reset-password?token=${token}`;
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Haushaltsbuch – Passwort zurücksetzen',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#E91E8C">Passwort zurücksetzen</h2>
          <p>Hallo ${user.name},</p>
          <p>du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p>
          <p>Klicke auf den folgenden Link (gültig 1 Stunde):</p>
          <p><a href="${resetUrl}" style="background:#E91E8C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Passwort zurücksetzen</a></p>
          <p style="color:#999;font-size:12px">Falls du keine Anfrage gestellt hast, ignoriere diese E-Mail.</p>
        </div>
      `
    });
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Ungültige Eingabe' });

    const { token, password } = req.body;
    const rows = await sequelize.query(
      `SELECT * FROM password_reset_tokens WHERE token = :token AND "expiresAt" > NOW() AND "usedAt" IS NULL LIMIT 1`,
      { replacements: { token }, type: 'SELECT' }
    );
    if (!rows.length) return res.status(400).json({ error: 'Link ungültig oder abgelaufen.' });

    const resetToken = rows[0];
    const hashed = await bcrypt.hash(password, 12);
    await User.update({ password: hashed }, { where: { id: resetToken.userId } });
    await sequelize.query(`UPDATE password_reset_tokens SET "usedAt" = NOW() WHERE token = :token`, { replacements: { token } });

    res.json({ message: 'Passwort erfolgreich geändert.' });
  } catch (err) {
    console.error('[auth] reset-password error:', err.message);
    res.status(500).json({ error: 'Fehler beim Zurücksetzen' });
  }
});

module.exports = router;
