const cron = require('node-cron');
const { randomUUID } = require('crypto');
let activeBackupJob = null;
let recurringJob = null;

// ── Recurring Transactions ────────────────────────────────────────────────────

function calcNextDate(interval, recurringDay, fromDate) {
  const d = new Date(fromDate);
  if (interval === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (interval === 'monthly') {
    d.setMonth(d.getMonth() + 1);
    if (recurringDay) {
      const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(recurringDay, maxDay));
    }
  } else if (interval === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

async function processRecurringTransactions() {
  try {
    const { Transaction } = require('../models');
    const { Op } = require('sequelize');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = await Transaction.findAll({
      where: {
        isRecurring: true,
        recurringNextDate: { [Op.lte]: today }
      }
    });

    if (due.length === 0) return;
    console.log(`[recurring] ${due.length} Buchung(en) fällig`);

    for (const t of due) {
      // Kopie der Buchung erstellen (ohne isRecurring)
      await Transaction.create({
        amount: t.amount,
        description: t.description,
        note: t.note,
        date: t.recurringNextDate,
        type: t.type,
        categoryId: t.categoryId,
        householdId: t.householdId,
        userId: t.userId,
        merchant: t.merchant,
        tags: t.tags || [],
        isConfirmed: true,
        isRecurring: false,
      });

      // Nächstes Fälligkeitsdatum berechnen
      const nextDate = calcNextDate(t.recurringInterval, t.recurringDay, t.recurringNextDate);
      await t.update({ recurringNextDate: nextDate });
      console.log(`[recurring] "${t.description || t.merchant}" → nächste Buchung: ${nextDate.toISOString().split('T')[0]}`);
    }
  } catch (err) {
    console.error('[recurring] Fehler:', err.message);
  }
}

// ── Backup Cron ───────────────────────────────────────────────────────────────

// ── Paperless Auto-Sync ───────────────────────────────────────────────────────

async function syncAllPaperless() {
  try {
    const { PaperlessConfig } = require('../models');
    const configs = await PaperlessConfig.findAll({ where: { isActive: true } });
    if (configs.length === 0) return;
    console.log(`[paperless-sync] Synchronisiere ${configs.length} Haushalt(e)...`);
    const axios = require('axios');
    const { sequelize, PaperlessDocumentType, PaperlessCorrespondent, PaperlessTag, PaperlessUser } = require('../models');

    for (const config of configs) {
      try {
        const baseURL = config.baseUrl.replace(/\/$/, '');
        const headers = { Authorization: `Token ${config.apiToken}`, 'Content-Type': 'application/json' };
        const hid = config.householdId;
        const now = new Date();

        const fetchAll = async (url) => {
          const results = [];
          let nextUrl = url;
          const origin = new URL(baseURL).origin;
          while (nextUrl) {
            const { data } = await axios.get(nextUrl, { headers, timeout: 30000 });
            results.push(...(data.results || []));
            if (data.next) {
              try { const u = new URL(data.next); u.protocol = new URL(baseURL).protocol; u.host = new URL(baseURL).host; nextUrl = u.toString(); } catch { nextUrl = null; }
            } else { nextUrl = null; }
          }
          return results;
        };

        const [docTypes, correspondents, tags] = await Promise.all([
          fetchAll(`${baseURL}/api/document_types/`),
          fetchAll(`${baseURL}/api/correspondents/`),
          fetchAll(`${baseURL}/api/tags/`),
        ]);
        let users = [];
        try { users = await fetchAll(`${baseURL}/api/users/`); } catch {}

        const nowIso = now.toISOString();
        const bulkUpsert = async (table, rows, conflictCols, updateCols) => {
          if (!rows.length) return;
          const cols = Object.keys(rows[0]);
          const ph = rows.map((_, ri) => `(${cols.map((_, ci) => `$${ri*cols.length+ci+1}`).join(',')})`).join(',');
          const vals = rows.flatMap(r => cols.map(c => r[c]));
          const conflict = conflictCols.map(c => `"${c}"`).join(',');
          const updates = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(',');
          await sequelize.query(`INSERT INTO ${table} (${cols.map(c=>`"${c}"`).join(',')}) VALUES ${ph} ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`, { bind: vals });
        };
        if (docTypes.length) await bulkUpsert('paperless_document_types',
          docTypes.map(dt => ({ id: randomUUID(), householdId: hid, paperlessId: dt.id, name: dt.name, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso })),
          ['householdId','paperlessId'], ['name','syncedAt','updatedAt']);
        if (correspondents.length) await bulkUpsert('paperless_correspondents',
          correspondents.map(c => ({ id: randomUUID(), householdId: hid, paperlessId: c.id, name: c.name, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso })),
          ['householdId','paperlessId'], ['name','syncedAt','updatedAt']);
        if (tags.length) await bulkUpsert('paperless_tags',
          tags.map(t => ({ id: randomUUID(), householdId: hid, paperlessId: t.id, name: t.name, color: t.colour||null, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso })),
          ['householdId','paperlessId'], ['name','color','syncedAt','updatedAt']);
        if (users.length) await bulkUpsert('paperless_users',
          users.map(u => ({ id: randomUUID(), householdId: hid, paperlessId: u.id, username: u.username, fullName: (`${u.first_name||''} ${u.last_name||''}`).trim()||u.username, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso })),
          ['householdId','paperlessId'], ['username','fullName','syncedAt','updatedAt']);

        // In Paperless gelöschte Einträge auch lokal entfernen
        const { Op } = require('sequelize');
        await Promise.all([
          PaperlessDocumentType.destroy({ where: { householdId: hid, paperlessId: { [Op.notIn]: docTypes.map(d => d.id) } } }),
          PaperlessCorrespondent.destroy({ where: { householdId: hid, paperlessId: { [Op.notIn]: correspondents.map(c => c.id) } } }),
          PaperlessTag.destroy({ where: { householdId: hid, paperlessId: { [Op.notIn]: tags.map(t => t.id) } } }),
          ...(users.length ? [PaperlessUser.destroy({ where: { householdId: hid, paperlessId: { [Op.notIn]: users.map(u => u.id) } } })] : []),
        ]);
        console.log(`[paperless-sync] Haushalt ${hid}: ${docTypes.length} Typen, ${correspondents.length} Absender, ${tags.length} Tags, ${users.length} Benutzer`);
      } catch (err) {
        console.error(`[paperless-sync] Haushalt ${config.householdId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[paperless-sync] Fehler:', err.message);
  }
}

async function startCron() {
  // Recurring: täglich um 06:00
  recurringJob = cron.schedule('0 6 * * *', processRecurringTransactions);
  console.log('[cron] Wiederkehrende Buchungen: täglich 06:00');

  // Paperless Auto-Sync: alle 6 Stunden
  cron.schedule('0 */6 * * *', syncAllPaperless);
  console.log('[cron] Paperless-Sync: alle 6 Stunden');

  // Monatsabschluss-Berichte: 1. jeden Monats um 08:00
  cron.schedule('0 8 1 * *', sendMonthlyReports);
  console.log('[cron] Monatsberichte: 1. jeden Monats 08:00');

  // Backup: aus Konfiguration
  try {
    const { BackupConfig } = require('../models');
    const config = await BackupConfig.findOne({ order: [['createdAt', 'DESC']] });
    if (config?.isActive && config?.schedule) {
      scheduleJob(config.schedule);
      console.log(`[cron] Backup scheduled: ${config.scheduleLabel || config.schedule}`);
    }
  } catch (e) {
    console.error('[cron] Failed to start backup job:', e.message);
  }
}

function scheduleJob(cronExpression) {
  if (activeBackupJob) { activeBackupJob.destroy(); activeBackupJob = null; }
  if (!cronExpression) return;
  activeBackupJob = cron.schedule(cronExpression, async () => {
    console.log('[backup] Running scheduled backup...');
    try {
      const { runGlobalBackup } = require('./backupService');
      const filename = await runGlobalBackup();
      console.log(`[backup] Done: ${filename}`);
    } catch (err) {
      console.error('[backup] Failed:', err.message);
      try {
        const { BackupConfig } = require('../models');
        const config = await BackupConfig.findOne({ order: [['createdAt', 'DESC']] });
        if (config) await config.update({ lastRunAt: new Date(), lastRunStatus: 'error', lastRunMessage: err.message });
      } catch {}
    }
  });
}

function stopCron() {
  if (activeBackupJob) { activeBackupJob.destroy(); activeBackupJob = null; }
  if (recurringJob) { recurringJob.destroy(); recurringJob = null; }
}

async function sendMonthlyReports() {
  try {
    if (!process.env.SMTP_HOST) return;
    const { Household, HouseholdMember, User } = require('../models');
    const { buildMonthlyReport, renderHtml } = require('../routes/reports');
    const nodemailer = require('nodemailer');
    const mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const now = new Date();
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const households = await Household.findAll({ where: { emailReportsEnabled: true } });
    for (const h of households) {
      try {
        const data = await buildMonthlyReport(h.id, year, lastMonth);
        const html = renderHtml(data);
        const members = await HouseholdMember.findAll({ where: { householdId: h.id }, include: [{ model: User, attributes: ['email', 'name'] }] });
        const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
        for (const m of members) {
          await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: m.User.email, subject: `Haushaltsbuch Monatsbericht ${monthNames[lastMonth-1]} ${year}`, html });
        }
        console.log(`[reports] Monatsbericht ${h.name}: ${members.length} E-Mails gesendet`);
      } catch (err) {
        console.error(`[reports] Fehler bei ${h.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[reports] Monatsbericht-Cron Fehler:', err.message);
  }
}

module.exports = { startCron, scheduleJob, stopCron, processRecurringTransactions };
