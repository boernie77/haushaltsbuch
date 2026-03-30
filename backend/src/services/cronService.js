const cron = require('node-cron');
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
    const { PaperlessDocumentType, PaperlessCorrespondent, PaperlessTag, PaperlessUser } = require('../models');

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

        const upsert = async (Model, paperlessId, fields) => {
          const ex = await Model.findOne({ where: { householdId: hid, paperlessId } });
          if (ex) await ex.update({ ...fields, syncedAt: now });
          else await Model.create({ householdId: hid, paperlessId, ...fields, syncedAt: now });
        };
        for (const dt of docTypes) await upsert(PaperlessDocumentType, dt.id, { name: dt.name });
        for (const c of correspondents) await upsert(PaperlessCorrespondent, c.id, { name: c.name });
        for (const t of tags) await upsert(PaperlessTag, t.id, { name: t.name, color: t.colour });
        for (const u of users) {
          const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
          await upsert(PaperlessUser, u.id, { username: u.username, fullName });
        }
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

module.exports = { startCron, scheduleJob, stopCron, processRecurringTransactions };
