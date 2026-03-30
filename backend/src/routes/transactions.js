const router = require('express').Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const { Transaction, Category, User, Household, HouseholdMember, Budget } = require('../models');
const { auth } = require('../middleware/auth');
const { checkBudgetWarning } = require('../services/budgetService');

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

    const where = { householdId };
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (search) where.description = { [Op.iLike]: `%${search}%` };

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
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
        { model: User, attributes: ['id', 'name', 'avatar'] }
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
            isRecurring, recurringInterval, recurringDay } = req.body;

    const access = await checkHouseholdAccess(req.user.id, householdId);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    // Erstes Fälligkeitsdatum berechnen
    let recurringNextDate = null;
    if (isRecurring === 'true' && recurringInterval && date) {
      const { processRecurringTransactions: _, ...cronUtils } = require('../services/cronService');
      const txDate = new Date(date);
      if (recurringInterval === 'weekly') {
        recurringNextDate = new Date(txDate); recurringNextDate.setDate(txDate.getDate() + 7);
      } else if (recurringInterval === 'monthly') {
        recurringNextDate = new Date(txDate); recurringNextDate.setMonth(txDate.getMonth() + 1);
      } else if (recurringInterval === 'yearly') {
        recurringNextDate = new Date(txDate); recurringNextDate.setFullYear(txDate.getFullYear() + 1);
      }
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
    });

    const full = await Transaction.findByPk(transaction.id, {
      include: [
        { model: Category, attributes: ['id', 'name', 'nameDE', 'icon', 'color'] },
        { model: User, attributes: ['id', 'name', 'avatar'] }
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

    const { amount, description, note, date, type, categoryId, merchant, tags, isConfirmed } = req.body;
    await transaction.update({ amount, description, note, date, type, categoryId, merchant, tags, isConfirmed });

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

module.exports = router;
