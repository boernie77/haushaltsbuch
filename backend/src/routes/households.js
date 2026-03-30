const router = require('express').Router();
const { Household, HouseholdMember, User, InviteCode, Transaction, Budget, Category, PaperlessConfig, PaperlessDocumentType, PaperlessCorrespondent, PaperlessTag } = require('../models');
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
      type: 'add_member',
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

// GET /api/households/:id/ai-settings — returns masked key + enabled flag
router.get('/:id/ai-settings', auth, async (req, res) => {
  try {
    const member = await HouseholdMember.findOne({ where: { householdId: req.params.id, userId: req.user.id } });
    if (!member) return res.status(403).json({ error: 'Access denied' });

    const household = await Household.findByPk(req.params.id);
    const key = household.anthropicApiKey;
    // Return masked key so client knows one is saved without exposing the full value
    const maskedKey = key
      ? key.substring(0, 18) + '…' + key.substring(key.length - 4)
      : null;

    res.json({ aiEnabled: household.aiEnabled, hasApiKey: !!key, maskedApiKey: maskedKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// PUT /api/households/:id/ai-settings — save key + toggle
router.put('/:id/ai-settings', auth, async (req, res) => {
  try {
    const member = await HouseholdMember.findOne({ where: { householdId: req.params.id, userId: req.user.id } });
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'Access denied' });

    const household = await Household.findByPk(req.params.id);
    const { aiEnabled, apiKey } = req.body;

    const updates = { aiEnabled: !!aiEnabled };
    // Only update key if a new non-empty one is provided
    if (apiKey && apiKey.trim()) updates.anthropicApiKey = apiKey.trim();
    // Allow clearing the key
    if (apiKey === '') updates.anthropicApiKey = null;

    await household.update(updates);

    // Verify the key works if one was provided
    if (updates.anthropicApiKey && aiEnabled) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: updates.anthropicApiKey });
        await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }]
        });
      } catch (e) {
        // Key invalid — don't save it
        await household.update({ anthropicApiKey: null, aiEnabled: false });
        return res.status(400).json({
          error: 'invalid_api_key',
          message: 'Der API-Key ist ungültig. Bitte überprüfe ihn auf console.anthropic.com.'
        });
      }
    }

    const key = household.anthropicApiKey;
    res.json({
      aiEnabled: household.aiEnabled,
      hasApiKey: !!key,
      maskedApiKey: key ? key.substring(0, 18) + '…' + key.substring(key.length - 4) : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save AI settings' });
  }
});

// DELETE /api/households/:id — Haushalt löschen (nur Admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const household = await Household.findByPk(id);
    if (!household) return res.status(404).json({ error: 'Haushalt nicht gefunden' });

    // Nur der Haushalt-Admin darf löschen
    const membership = await HouseholdMember.findOne({ where: { householdId: id, userId: req.user.id, role: 'admin' } });
    if (!membership) return res.status(403).json({ error: 'Nur der Haushalt-Admin kann löschen' });

    // Sicherstellen, dass der Nutzer noch mindestens einen anderen Haushalt hat
    const otherHouseholds = await HouseholdMember.count({ where: { userId: req.user.id, householdId: { [require('sequelize').Op.ne]: id } } });
    if (otherHouseholds === 0) return res.status(400).json({ error: 'Das letzte Haushaltsbuch kann nicht gelöscht werden' });

    // Alle abhängigen Daten löschen
    await Promise.all([
      Transaction.destroy({ where: { householdId: id } }),
      Budget.destroy({ where: { householdId: id } }),
      Category.destroy({ where: { householdId: id, isSystem: false } }),
      InviteCode.destroy({ where: { householdId: id } }),
      PaperlessDocumentType.destroy({ where: { householdId: id } }),
      PaperlessCorrespondent.destroy({ where: { householdId: id } }),
      PaperlessTag.destroy({ where: { householdId: id } }),
      PaperlessConfig.destroy({ where: { householdId: id } }),
      HouseholdMember.destroy({ where: { householdId: id } }),
    ]);
    await household.destroy();

    res.json({ message: 'Haushalt gelöscht' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Löschen' });
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
