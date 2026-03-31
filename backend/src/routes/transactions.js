const router = require('express').Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const { Transaction, TransactionSplit, Category, User, Household, HouseholdMember, Budget } = require('../models');
const { auth } = require('../middleware/auth');
const { checkBudgetWarning } = require('../services/budgetService');
const { getMonthBounds } = require('../utils/monthBounds');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => cb(null, `receipt_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Helper: check household access
async function checkHouseholdAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// GET /api/transactions?householdId=&month=&year=&categoryId=&type=&page=&limit=
router.get('/', auth, async (req, res) => {
  try {
    const { householdId, month, year, categoryId, type, page = 1, limit = 50, search } = req.query;
    if (!householdId) return res.status(400).json({ error: 'householdId required' });

    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const where = { householdId, isRecurring: { [Op.ne]: true } };
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (search) where.description = { [Op.iLike]: `%${search}%` };

    if (month && year) {
      const household = await Household.findByPk(householdId, { attributes: ['monthStartDay'] });
      const { start: startDate, end: endDate } = getMonthBounds(parseInt(year), parseInt(month), household?.monthStartDay || 1);
      where.date = { [Op.between]: [startDate, endDate] };
    } else if (year) {
      where.date = {
        [Op.between]: [new Date(year, 0, 1), new Date(year, 11, 31)]
      };
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      include: [
        { model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] },
        { model: User, attributes: ['id', 'name', 'avatar'] },
        { model: TransactionSplit, as: 'splits', include: [{ model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] }] }
      ],
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({ transactions: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/recurring?householdId=
router.get('/recurring', auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!householdId) return res.status(400).json({ error: 'householdId required' });
    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const rows = await Transaction.findAll({
      where: { householdId, isRecurring: true },
      include: [{ model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] }],
      order: [['recurringNextDate', 'ASC']]
    });
    res.json({ recurring: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recurring' });
  }
});

// DELETE /api/transactions/recurring/:id — Wiederkehrende Buchung beenden
router.delete('/recurring/:id', auth, async (req, res) => {
  try {
    const t = await Transaction.findByPk(req.params.id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    const access = await checkHouseholdAccess(req.user.id, t.householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });
    await t.update({ isRecurring: false, recurringNextDate: null });
    res.json({ message: 'Recurring stopped' });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/transactions
router.post('/', auth, upload.single('receipt'), async (req, res) => {
  try {
    const { amount, description, note, date, type, categoryId, householdId, merchant, tags, isConfirmed,
            isRecurring, recurringInterval, recurringDay, isPersonal, targetHouseholdId, splits } = req.body;

    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    // Erstes Fälligkeitsdatum = das Buchungsdatum selbst (Cron erstellt ab dann Kopien)
    let recurringNextDate = null;
    if (isRecurring === 'true' && date) {
      recurringNextDate = new Date(date);
    }

    // Quittungsbild verarbeiten (Dokument-Scan-Filter)
    if (req.file) {
      const { processReceiptFile } = require('../utils/receiptProcessor');
      await processReceiptFile(req.file.path);
    }

    const transaction = await Transaction.create({
      amount: parseFloat(amount),
      description,
      note,
      date: date || new Date(),
      type: type || 'expense',
      categoryId,
      householdId,
      userId: req.user.id,
      merchant,
      tags: tags ? JSON.parse(tags) : [],
      receiptImage: req.file ? `/uploads/${req.file.filename}` : null,
      isConfirmed: isConfirmed !== 'false',
      isRecurring: isRecurring === 'true',
      recurringInterval: isRecurring === 'true' ? recurringInterval : null,
      recurringDay: recurringDay ? parseInt(recurringDay) : null,
      recurringNextDate,
      isPersonal: isPersonal === 'true' || isPersonal === true,
      targetHouseholdId: type === 'transfer' ? targetHouseholdId : null,
    });

    // Splits speichern falls vorhanden
    if (splits) {
      const splitData = typeof splits === 'string' ? JSON.parse(splits) : splits;
      if (Array.isArray(splitData) && splitData.length > 0) {
        await TransactionSplit.bulkCreate(splitData.map(s => ({
          transactionId: transaction.id,
          categoryId: s.categoryId || null,
          amount: parseFloat(s.amount),
          description: s.description || null,
        })));
      }
    }

    const full = await Transaction.findByPk(transaction.id, {
      include: [
        { model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] },
        { model: User, attributes: ['id', 'name', 'avatar'] },
        { model: TransactionSplit, as: 'splits', include: [{ model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] }] }
      ]
    });

    // Check budget warning
    const warning = await checkBudgetWarning(householdId, categoryId, date || new Date());

    res.status(201).json({ transaction: full, budgetWarning: warning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Not found' });

    const access = await checkHouseholdAccess(req.user.id, transaction.householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const { amount, description, note, date, type, categoryId, merchant, tags, isConfirmed, isRecurring, recurringInterval } = req.body;
    const updates = { amount, description, note, date, type, categoryId, merchant, tags, isConfirmed };
    if (isRecurring !== undefined) {
      updates.isRecurring = isRecurring;
      updates.recurringInterval = isRecurring ? recurringInterval : null;
      if (isRecurring && !transaction.isRecurring) {
        // Neu als wiederkehrend markiert → nächstes Datum berechnen
        const d = new Date(date || transaction.date);
        if (recurringInterval === 'weekly') d.setDate(d.getDate() + 7);
        else if (recurringInterval === 'yearly') d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
        updates.recurringNextDate = d;
      }
    }
    await transaction.update(updates);

    const full = await Transaction.findByPk(transaction.id, {
      include: [
        { model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] },
        { model: User, attributes: ['id', 'name', 'avatar'] }
      ]
    });

    res.json({ transaction: full });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// PUT /api/transactions/:id/move — Buchung in anderes Haushaltsbuch verschieben
router.put('/:id/move', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Not found' });

    const sourceAccess = await checkHouseholdAccess(req.user.id, transaction.householdId);
    if (!sourceAccess) return res.status(403).json({ error: 'Access denied' });

    const { targetHouseholdId } = req.body;
    if (!targetHouseholdId) return res.status(400).json({ error: 'targetHouseholdId required' });

    const targetAccess = await checkHouseholdAccess(req.user.id, targetHouseholdId);
    if (!targetAccess) return res.status(403).json({ error: 'Kein Zugriff auf Ziel-Haushaltsbuch' });

    // Kategorie: Systemkategorien bleiben, benutzerdefinierte werden entfernt wenn nicht im Ziel verfügbar
    let warning = null;
    if (transaction.categoryId) {
      const cat = await Category.findByPk(transaction.categoryId);
      if (cat && !cat.isSystem && cat.householdId && cat.householdId !== targetHouseholdId) {
        await transaction.update({ householdId: targetHouseholdId, categoryId: null });
        warning = 'Kategorie wurde entfernt (nicht im Ziel-Haushaltsbuch verfügbar)';
        const full = await Transaction.findByPk(transaction.id, { include: [{ model: Category }, { model: User, attributes: ['id', 'name', 'avatar'] }] });
        return res.json({ transaction: full, warning });
      }
    }

    await transaction.update({ householdId: targetHouseholdId });
    res.json({ transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move transaction' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Not found' });

    const access = await checkHouseholdAccess(req.user.id, transaction.householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    await transaction.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// POST /api/transactions/duplicate-check
router.post('/duplicate-check', auth, async (req, res) => {
  try {
    const { householdId, amount, date, description, merchant, excludeId } = req.body;
    if (!await checkHouseholdAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const checkDate = new Date(date);
    const from = new Date(checkDate); from.setDate(from.getDate() - 3);
    const to = new Date(checkDate); to.setDate(to.getDate() + 3);

    const where = {
      householdId,
      isRecurring: { [Op.ne]: true },
      amount: { [Op.between]: [parseFloat(amount) - 0.01, parseFloat(amount) + 0.01] },
      date: { [Op.between]: [from, to] },
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const candidates = await Transaction.findAll({
      where,
      include: [{ model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] }],
      limit: 5,
    });

    // Filter by description/merchant similarity
    const searchTerm = (description || merchant || '').toLowerCase();
    const duplicates = searchTerm
      ? candidates.filter(t =>
          (t.description || '').toLowerCase().includes(searchTerm) ||
          (t.merchant || '').toLowerCase().includes(searchTerm) ||
          searchTerm.includes((t.description || '').toLowerCase()) ||
          searchTerm.includes((t.merchant || '').toLowerCase())
        )
      : candidates;

    res.json({ duplicates });
  } catch (err) {
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

module.exports = router;
