const router = require('express').Router();
const { User, Household, HouseholdMember, Transaction, InviteCode, GlobalSettings, BackupConfig } = require('../models');
const { auth, adminGuard, superAdminGuard } = require('../middleware/auth');
const { fn, col, Op } = require('sequelize');

// GET /api/admin/stats
router.get('/stats', auth, superAdminGuard, async (req, res) => {
  try {
    const { sequelize } = require('../models');
    const [householdAdminCount, transactionCount] = await Promise.all([
      // Count distinct household admins (= number of "top-level households")
      Household.count({ distinct: true, col: 'adminUserId' }),
      Transaction.count()
    ]);

    // Count users who own at least one household
    const adminUserIds = await Household.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('adminUserId')), 'adminUserId']],
      raw: true
    });
    const userCount = adminUserIds.length;

    res.json({ userCount, householdCount: householdAdminCount, transactionCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users — only users who own at least one household
router.get('/users', auth, superAdminGuard, async (req, res) => {
  try {
    // Find all distinct adminUserIds from households
    const adminHouseholds = await Household.findAll({
      attributes: ['adminUserId', 'id', 'name'],
      raw: true
    });

    // Group by adminUserId to get their household names
    const grouped = {};
    adminHouseholds.forEach(h => {
      if (!grouped[h.adminUserId]) grouped[h.adminUserId] = [];
      grouped[h.adminUserId].push(h.name);
    });

    const adminUserIds = Object.keys(grouped);
    const users = await User.findAll({
      where: { id: adminUserIds },
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'ASC']]
    });

    const usersWithHouseholds = users.map(u => ({
      ...u.toJSON(),
      households: grouped[u.id] || []
    }));

    res.json({ users: usersWithHouseholds, total: usersWithHouseholds.length });
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

// GET /api/admin/households?search=
router.get('/households', auth, superAdminGuard, async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search) where.name = { [Op.iLike]: `%${search}%` };

    const households = await Household.findAll({
      where,
      include: [{ model: HouseholdMember, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ households });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch households' });
  }
});

// GET /api/admin/ai-settings
router.get('/ai-settings', auth, superAdminGuard, async (req, res) => {
  try {
    const settings = await GlobalSettings.findByPk('global');
    const key = settings?.anthropicApiKey;
    res.json({
      hasApiKey: !!key,
      maskedApiKey: key ? key.substring(0, 18) + '…' + key.substring(key.length - 4) : null,
      aiKeyPublic: settings?.aiKeyPublic || false
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// PUT /api/admin/ai-settings
router.put('/ai-settings', auth, superAdminGuard, async (req, res) => {
  try {
    const { apiKey, aiKeyPublic } = req.body;
    let settings = await GlobalSettings.findByPk('global');
    if (!settings) settings = await GlobalSettings.create({ id: 'global' });

    const updates = { aiKeyPublic: !!aiKeyPublic };
    if (apiKey && apiKey.trim()) {
      // Validate the key before saving
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: apiKey.trim() });
        await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] });
      } catch (e) {
        return res.status(400).json({ error: 'invalid_api_key', message: 'Der API-Key ist ungültig.' });
      }
      updates.anthropicApiKey = apiKey.trim();
    }
    if (apiKey === '') updates.anthropicApiKey = null;

    await settings.update(updates);
    const key = settings.anthropicApiKey;
    res.json({
      hasApiKey: !!key,
      maskedApiKey: key ? key.substring(0, 18) + '…' + key.substring(key.length - 4) : null,
      aiKeyPublic: settings.aiKeyPublic
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save AI settings' });
  }
});

// PUT /api/admin/users/:id/ai-grant — toggle aiKeyGranted for a user
router.put('/users/:id/ai-grant', auth, superAdminGuard, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    if (!user) return res.status(404).json({ error: 'Not found' });
    await user.update({ aiKeyGranted: !user.aiKeyGranted });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update AI grant' });
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
      code, type: 'new_household', role: 'admin', maxUses: maxUses || 1,
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

// ── Backup routes ─────────────────────────────────────────────────────────────

// GET /api/admin/backup/ssh-key — returns (and auto-generates) the server's SSH public key
router.get('/backup/ssh-key', auth, superAdminGuard, async (req, res) => {
  try {
    let global = await GlobalSettings.findOne({ where: { id: 'global' } });
    if (!global) global = await GlobalSettings.create({ id: 'global' });

    if (!global.sshPublicKey) {
      const { generateSshKeyPair } = require('../utils/sshKey');
      const { privateKey, publicKey } = generateSshKeyPair();
      await global.update({ sshPrivateKey: privateKey, sshPublicKey: publicKey });
      global = await GlobalSettings.findOne({ where: { id: 'global' } });
    }

    res.json({ publicKey: global.sshPublicKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get SSH key' });
  }
});

// POST /api/admin/backup/ssh-key/regenerate — generates a new key pair
router.post('/backup/ssh-key/regenerate', auth, superAdminGuard, async (req, res) => {
  try {
    const { generateSshKeyPair } = require('../utils/sshKey');
    const { privateKey, publicKey } = generateSshKeyPair();
    let global = await GlobalSettings.findOne({ where: { id: 'global' } });
    if (!global) global = await GlobalSettings.create({ id: 'global' });
    await global.update({ sshPrivateKey: privateKey, sshPublicKey: publicKey });
    res.json({ publicKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to regenerate SSH key' });
  }
});

// GET /api/admin/backup/config
router.get('/backup/config', auth, superAdminGuard, async (req, res) => {
  try {
    const config = await BackupConfig.findOne({ order: [['createdAt', 'DESC']] });
    if (!config) return res.json({ hasConfig: false });
    const { sftpPassword, ...safe } = config.toJSON();
    res.json({ hasConfig: true, config: { ...safe, hasPassword: !!sftpPassword } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch backup config' });
  }
});

// PUT /api/admin/backup/config
router.put('/backup/config', auth, superAdminGuard, async (req, res) => {
  try {
    const { sftpHost, sftpPort, sftpUser, sftpPassword, sftpPath, schedule, scheduleLabel, isActive } = req.body;
    const updates = { sftpHost, sftpPort: sftpPort || 22, sftpUser, sftpPath: sftpPath || '/backups', schedule, scheduleLabel, isActive: !!isActive };
    if (sftpPassword && sftpPassword.trim()) updates.sftpPassword = sftpPassword.trim();

    let config = await BackupConfig.findOne({ order: [['createdAt', 'DESC']] });
    if (config) await config.update(updates);
    else config = await BackupConfig.create(updates);

    const { scheduleJob } = require('../services/cronService');
    scheduleJob(isActive && schedule ? schedule : null);

    const { sftpPassword: _, ...safe } = config.toJSON();
    res.json({ config: { ...safe, hasPassword: !!config.sftpPassword } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save backup config' });
  }
});

// POST /api/admin/backup/test
router.post('/backup/test', auth, superAdminGuard, async (req, res) => {
  try {
    const { sftpHost, sftpPort, sftpUser, sftpPassword, sftpPath } = req.body;
    const { uploadToSftp } = require('../services/backupService');

    // Load SSH private key from GlobalSettings if no password given
    let sshPrivateKey = null;
    if (!sftpPassword) {
      const global = await GlobalSettings.findOne({ where: { id: 'global' } });
      sshPrivateKey = global?.sshPrivateKey || null;
    }

    await uploadToSftp(
      { sftpHost, sftpPort: sftpPort || 22, sftpUser, sftpPassword, sftpPath: sftpPath || '/backups', sshPrivateKey },
      Buffer.from('haushaltsbuch connection test\n'), 'connection-test.txt'
    );
    res.json({ success: true, message: 'Verbindung erfolgreich!' });
  } catch (err) {
    res.status(400).json({ success: false, message: `Verbindung fehlgeschlagen: ${err.message}` });
  }
});

// POST /api/admin/backup/restore/preview — parse file, return metadata without restoring
router.post('/backup/restore/preview', auth, superAdminGuard, (req, res) => {
  const multer = require('multer');
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })
    .single('backup')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
      try {
        const { parseBackupBuffer } = require('../services/backupService');
        const data = parseBackupBuffer(req.file.buffer);
        const t = data.tables;
        res.json({
          exportedAt: data.exportedAt,
          version: data.version,
          counts: {
            users:        t.users?.length        || 0,
            households:   t.households?.length   || 0,
            categories:   t.categories?.length   || 0,
            transactions: t.transactions?.length || 0,
            budgets:      t.budgets?.length      || 0,
            inviteCodes:  t.invite_codes?.length || 0,
          },
        });
      } catch (e) {
        res.status(400).json({ error: `Backup konnte nicht gelesen werden: ${e.message}` });
      }
    });
});

// POST /api/admin/backup/restore — full restore (destructive!)
router.post('/backup/restore', auth, superAdminGuard, (req, res) => {
  const multer = require('multer');
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })
    .single('backup')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
      try {
        const { parseBackupBuffer, restoreAllData } = require('../services/backupService');
        const data = parseBackupBuffer(req.file.buffer);
        const result = await restoreAllData(data);
        console.log(`[backup] Wiederherstellung abgeschlossen:`, result);
        res.json({ success: true, restored: result, exportedAt: data.exportedAt });
      } catch (e) {
        console.error('[backup] Restore error:', e);
        res.status(500).json({ error: `Wiederherstellung fehlgeschlagen: ${e.message}` });
      }
    });
});

// POST /api/admin/backup/run
router.post('/backup/run', auth, superAdminGuard, async (req, res) => {
  try {
    const { runGlobalBackup } = require('../services/backupService');
    const filename = await runGlobalBackup();
    res.json({ success: true, message: `Backup gespeichert: ${filename}` });
  } catch (err) {
    console.error('Backup run error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
