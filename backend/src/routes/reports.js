const router = require('express').Router();
const { Op, fn, col, literal } = require('sequelize');
const { Transaction, Category, Household, HouseholdMember, User } = require('../models');
const { auth } = require('../middleware/auth');

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

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

async function buildMonthlyReport(householdId, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const household = await Household.findByPk(householdId);

  const [transactions, byCategory, totals] = await Promise.all([
    Transaction.findAll({
      where: { householdId, date: { [Op.between]: [start, end] } },
      include: [
        { model: Category, attributes: ['name', 'nameDE', 'icon', 'color'] },
        { model: User, attributes: ['name'] }
      ],
      order: [['date', 'ASC']],
    }),
    Transaction.findAll({
      attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
      where: { householdId, type: 'expense', date: { [Op.between]: [start, end] } },
      include: [{ model: Category, attributes: ['name', 'nameDE', 'icon', 'color'] }],
      group: ['categoryId', 'Category.id'],
      order: [[literal('total'), 'DESC']],
    }),
    Promise.all([
      Transaction.sum('amount', { where: { householdId, type: 'expense', date: { [Op.between]: [start, end] } } }),
      Transaction.sum('amount', { where: { householdId, type: 'income', date: { [Op.between]: [start, end] } } }),
    ]),
  ]);

  const totalExp = parseFloat(totals[0]) || 0;
  const totalInc = parseFloat(totals[1]) || 0;
  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: household.currency || 'EUR' }).format(n);

  const categoryRows = byCategory.map(b => `
    <tr>
      <td>${b.Category?.icon || ''} ${b.Category?.nameDE || b.Category?.name || 'Sonstige'}</td>
      <td style="text-align:right">${fmt(parseFloat(b.dataValues.total))}</td>
    </tr>`).join('');

  const txRows = transactions.map(t => `
    <tr>
      <td>${t.date}</td>
      <td>${t.description || t.merchant || '–'}</td>
      <td>${t.Category?.nameDE || t.Category?.name || '–'}</td>
      <td style="text-align:right;color:${t.type==='income'?'#16a34a':'#dc2626'}">${t.type==='income'?'+':'−'}${fmt(parseFloat(t.amount))}</td>
      <td>${t.User?.name || ''}</td>
    </tr>`).join('');

  return { household, totalExp, totalInc, monthNames, fmt, categoryRows, txRows, month, year };
}

function renderHtml(data) {
  const { household, totalExp, totalInc, monthNames, fmt, categoryRows, txRows, month, year } = data;
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Monatsbericht ${monthNames[month-1]} ${year}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { color: #E91E8C; }
  h2 { color: #555; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-top: 32px; }
  .summary { display: flex; gap: 24px; margin: 24px 0; }
  .card { background: #f9f9f9; border-radius: 8px; padding: 16px 24px; flex: 1; }
  .card .label { font-size: 13px; color: #888; }
  .card .value { font-size: 24px; font-weight: bold; margin-top: 4px; }
  .red { color: #dc2626; }
  .green { color: #16a34a; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #f0f0f0; text-align: left; padding: 8px 12px; font-size: 13px; }
  td { padding: 7px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>💰 Haushaltsbuch</h1>
<h2>Monatsbericht ${monthNames[month-1]} ${year} — ${household.name}</h2>

<div class="summary">
  <div class="card"><div class="label">Ausgaben</div><div class="value red">${fmt(totalExp)}</div></div>
  <div class="card"><div class="label">Einnahmen</div><div class="value green">${fmt(totalInc)}</div></div>
  <div class="card"><div class="label">Bilanz</div><div class="value ${totalInc-totalExp>=0?'green':'red'}">${fmt(totalInc-totalExp)}</div></div>
  ${totalInc > 0 ? `<div class="card"><div class="label">Sparquote</div><div class="value ${totalInc-totalExp>=0?'green':'red'}">${Math.round((totalInc-totalExp)/totalInc*100)}%</div></div>` : ''}
</div>

<h2>Ausgaben nach Kategorie</h2>
<table>
  <thead><tr><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
  <tbody>${categoryRows}</tbody>
</table>

<h2>Alle Buchungen</h2>
<table>
  <thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th><th style="text-align:right">Betrag</th><th>Person</th></tr></thead>
  <tbody>${txRows}</tbody>
</table>

<p style="margin-top:40px;font-size:11px;color:#999">Erstellt am ${new Date().toLocaleDateString('de-DE')} · Haushaltsbuch</p>
</body>
</html>`;
}

// GET /api/reports/monthly?householdId=&month=&year=&format=html
router.get('/monthly', auth, async (req, res) => {
  try {
    const { householdId, month, year, format = 'html' } = req.query;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    const data = await buildMonthlyReport(householdId, y, m);
    const html = renderHtml(data);

    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bericht-${y}-${String(m).padStart(2,'0')}.html"`);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// POST /api/reports/send-monthly — sendet Bericht per E-Mail an alle Haushaltsmitglieder
router.post('/send-monthly', auth, async (req, res) => {
  try {
    const { householdId, month, year } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const mailer = getMailer();
    if (!mailer) return res.status(503).json({ error: 'E-Mail nicht konfiguriert (SMTP_HOST fehlt)' });

    const m = parseInt(month) || new Date().getMonth();
    const y = parseInt(year) || new Date().getFullYear();
    const data = await buildMonthlyReport(householdId, y, m);
    const html = renderHtml(data);

    const members = await HouseholdMember.findAll({
      where: { householdId },
      include: [{ model: User, attributes: ['name', 'email'] }]
    });

    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    await Promise.all(members.map(m2 => mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: m2.User.email,
      subject: `Haushaltsbuch Monatsbericht ${monthNames[m-1]} ${y}`,
      html,
    })));

    res.json({ message: `Bericht an ${members.length} Mitglieder gesendet` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send report: ' + err.message });
  }
});

module.exports = { router, buildMonthlyReport, renderHtml };
