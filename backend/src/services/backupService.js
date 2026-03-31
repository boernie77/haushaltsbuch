const zlib = require('zlib');
const { User, Household, HouseholdMember, Category, Transaction, Budget,
        GlobalSettings, InviteCode, BackupConfig } = require('../models');

// ── Global backup (all data, gzipped JSON) ───────────────────────────────────
async function exportAllData() {
  const [users, households, members, categories, transactions, budgets, globalSettings, inviteCodes] =
    await Promise.all([
      User.findAll({ attributes: { exclude: ['password'] } }),
      Household.findAll(),
      HouseholdMember.findAll(),
      Category.findAll(),
      Transaction.findAll(),
      Budget.findAll(),
      GlobalSettings.findAll(),
      InviteCode.findAll(),
    ]);

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    tables: {
      users: users.map(u => u.toJSON()),
      households: households.map(h => h.toJSON()),
      household_members: members.map(m => m.toJSON()),
      categories: categories.map(c => c.toJSON()),
      transactions: transactions.map(t => t.toJSON()),
      budgets: budgets.map(b => b.toJSON()),
      global_settings: globalSettings.map(g => g.toJSON()),
      invite_codes: inviteCodes.map(i => i.toJSON()),
    },
  };
}

// ── Household export (JSON or CSV) ───────────────────────────────────────────
async function exportHouseholdData(householdId, format = 'json') {
  const [transactions, customCategories, budgets, household] = await Promise.all([
    Transaction.findAll({ where: { householdId }, include: [{ model: Category }] }),
    Category.findAll({ where: { householdId } }),
    Budget.findAll({ where: { householdId } }),
    Household.findByPk(householdId),
  ]);

  if (format === 'csv') {
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['Datum,Betrag,Typ,Beschreibung,Händler,Kategorie,Notiz'];
    for (const t of transactions) {
      lines.push([
        t.date,
        t.amount,
        escape(t.type === 'income' ? 'Einnahme' : 'Ausgabe'),
        escape(t.description || ''),
        escape(t.merchant || ''),
        escape(t.Category?.nameDE || t.Category?.name || ''),
        escape(t.note || ''),
      ].join(','));
    }
    return lines.join('\n');
  }

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    household: { name: household?.name, currency: household?.currency },
    transactions: transactions.map(t => t.toJSON()),
    categories: customCategories.map(c => c.toJSON()),
    budgets: budgets.map(b => b.toJSON()),
  };
}

// ── Household import ──────────────────────────────────────────────────────────
async function importHouseholdData(householdId, rawData, userId) {
  const stats = { imported: 0, skipped: 0, errors: [] };

  let transactions = [];
  let customCategories = [];

  const isCSV = typeof rawData === 'string';

  if (isCSV) {
    const lines = rawData.trim().split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parse (handles quoted fields)
      const cols = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
      if (cols.length < 2) continue;
      transactions.push({
        date: cols[0]?.trim(),
        amount: parseFloat(cols[1]),
        type: cols[2]?.trim() === 'Einnahme' ? 'income' : 'expense',
        description: cols[3]?.trim() || null,
        merchant: cols[4]?.trim() || null,
        categoryName: cols[5]?.trim() || null,
        note: cols[6]?.trim() || null,
      });
    }
  } else {
    transactions = rawData.transactions || [];
    customCategories = rawData.categories || [];
  }

  // Import custom (household-specific) categories first, build ID map
  const categoryIdMap = {};
  for (const cat of customCategories) {
    let existing = await Category.findOne({ where: { householdId, name: cat.name } });
    if (!existing) {
      existing = await Category.create({
        name: cat.name, nameDE: cat.nameDE, icon: cat.icon || 'tag',
        color: cat.color || '#6B7280', isSystem: false, householdId, sortOrder: cat.sortOrder || 0,
      });
    }
    if (cat.id) categoryIdMap[cat.id] = existing.id;
  }

  // Index system categories by name for matching
  const systemCats = await Category.findAll({ where: { isSystem: true } });
  const catByName = {};
  systemCats.forEach(c => {
    if (c.nameDE) catByName[c.nameDE.toLowerCase()] = c.id;
    catByName[c.name.toLowerCase()] = c.id;
  });

  for (const t of transactions) {
    try {
      const existing = await Transaction.findOne({
        where: { householdId, date: t.date, amount: t.amount, type: t.type || 'expense', description: t.description || null }
      });
      if (existing) { stats.skipped++; continue; }

      let categoryId = null;
      if (t.categoryId && categoryIdMap[t.categoryId]) categoryId = categoryIdMap[t.categoryId];
      else if (t.categoryName) categoryId = catByName[t.categoryName.toLowerCase()] || null;
      else if (t.Category) categoryId = catByName[(t.Category.nameDE || t.Category.name || '').toLowerCase()] || null;

      await Transaction.create({
        amount: t.amount, description: t.description || null, note: t.note || null,
        date: t.date, type: t.type || 'expense', categoryId, householdId, userId,
        merchant: t.merchant || null, tags: t.tags || [], isConfirmed: true,
      });
      stats.imported++;
    } catch (e) {
      stats.errors.push(`${t.date} ${t.amount}: ${e.message}`);
    }
  }

  return stats;
}

// ── SFTP upload ───────────────────────────────────────────────────────────────
async function uploadToSftp(config, buffer, filename) {
  const SftpClient = require('ssh2-sftp-client');
  const sftp = new SftpClient();

  const connectOpts = {
    host: config.sftpHost,
    port: config.sftpPort || 22,
    username: config.sftpUser,
    readyTimeout: 15000,
  };

  if (config.sshPrivateKey) {
    // SSH key auth (preferred)
    connectOpts.privateKey = config.sshPrivateKey;
  } else if (config.sftpPassword) {
    connectOpts.password = config.sftpPassword;
  } else {
    throw new Error('Weder Passwort noch SSH-Key konfiguriert');
  }

  await sftp.connect(connectOpts);
  try {
    await sftp.mkdir(config.sftpPath, true).catch(() => {});
    await sftp.put(buffer, `${config.sftpPath}/${filename}`);
  } finally {
    await sftp.end();
  }
}

// ── Run global backup ─────────────────────────────────────────────────────────
async function runGlobalBackup() {
  const [config, globalSettings] = await Promise.all([
    BackupConfig.findOne({ order: [['createdAt', 'DESC']] }),
    GlobalSettings.findOne({ where: { id: 'global' } }),
  ]);
  if (!config?.sftpHost) throw new Error('Keine Backup-Konfiguration vorhanden');

  // Prefer SSH key auth over password
  const sshPrivateKey = globalSettings?.sshPrivateKey || null;

  const data = await exportAllData();
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
  const date = new Date().toISOString().split('T')[0];
  const filename = `haushaltsbuch-backup-${date}.json.gz`;

  await uploadToSftp({ ...config.toJSON(), sshPrivateKey }, compressed, filename);

  await config.update({
    lastRunAt: new Date(), lastRunStatus: 'success',
    lastRunMessage: `${filename} (${Math.round(compressed.length / 1024)} KB)`,
  });

  return filename;
}

module.exports = { exportAllData, exportHouseholdData, importHouseholdData, uploadToSftp, runGlobalBackup };
