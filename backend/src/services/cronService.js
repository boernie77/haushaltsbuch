const cron = require('node-cron');
let activeJob = null;

async function startCron() {
  try {
    const { BackupConfig } = require('../models');
    const config = await BackupConfig.findOne({ order: [['createdAt', 'DESC']] });
    if (config?.isActive && config?.schedule) {
      scheduleJob(config.schedule);
      console.log(`[cron] Backup scheduled: ${config.scheduleLabel || config.schedule}`);
    }
  } catch (e) {
    console.error('[cron] Failed to start:', e.message);
  }
}

function scheduleJob(cronExpression) {
  if (activeJob) { activeJob.destroy(); activeJob = null; }
  if (!cronExpression) return;
  activeJob = cron.schedule(cronExpression, async () => {
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
  if (activeJob) { activeJob.destroy(); activeJob = null; }
}

module.exports = { startCron, scheduleJob, stopCron };
