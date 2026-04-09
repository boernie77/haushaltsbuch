const zlib = require("zlib");
const {
  User,
  Household,
  HouseholdMember,
  Category,
  Transaction,
  Budget,
  GlobalSettings,
  InviteCode,
  BackupConfig,
} = require("../models");

// ── Global backup (all data, gzipped JSON) ───────────────────────────────────
async function exportAllData() {
  const [
    users,
    households,
    members,
    categories,
    transactions,
    budgets,
    globalSettings,
    inviteCodes,
  ] = await Promise.all([
    User.findAll({ attributes: { exclude: ["password"] } }),
    Household.findAll(),
    HouseholdMember.findAll(),
    Category.findAll(),
    Transaction.findAll(),
    Budget.findAll(),
    GlobalSettings.findAll(),
    InviteCode.findAll(),
  ]);

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    tables: {
      users: users.map((u) => u.toJSON()),
      households: households.map((h) => h.toJSON()),
      household_members: members.map((m) => m.toJSON()),
      categories: categories.map((c) => c.toJSON()),
      transactions: transactions.map((t) => t.toJSON()),
      budgets: budgets.map((b) => b.toJSON()),
      global_settings: globalSettings.map((g) => g.toJSON()),
      invite_codes: inviteCodes.map((i) => i.toJSON()),
    },
  };
}

// ── Household export (JSON or CSV) ───────────────────────────────────────────
async function exportHouseholdData(householdId, format = "json") {
  const [transactions, customCategories, budgets, household] =
    await Promise.all([
      Transaction.findAll({
        where: { householdId },
        include: [{ model: Category }],
      }),
      Category.findAll({ where: { householdId } }),
      Budget.findAll({ where: { householdId } }),
      Household.findByPk(householdId),
    ]);

  if (format === "csv") {
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Datum,Betrag,Typ,Beschreibung,Händler,Kategorie,Notiz"];
    for (const t of transactions) {
      lines.push(
        [
          t.date,
          t.amount,
          escape(t.type === "income" ? "Einnahme" : "Ausgabe"),
          escape(t.description || ""),
          escape(t.merchant || ""),
          escape(t.Category?.nameDE || t.Category?.name || ""),
          escape(t.note || ""),
        ].join(",")
      );
    }
    return lines.join("\n");
  }

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    household: { name: household?.name, currency: household?.currency },
    transactions: transactions.map((t) => t.toJSON()),
    categories: customCategories.map((c) => c.toJSON()),
    budgets: budgets.map((b) => b.toJSON()),
  };
}

// ── Household import ──────────────────────────────────────────────────────────
async function importHouseholdData(householdId, rawData, userId) {
  const stats = { imported: 0, skipped: 0, errors: [] };

  let transactions = [];
  let customCategories = [];

  const isCSV = typeof rawData === "string";

  if (isCSV) {
    const lines = rawData.trim().split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parse (handles quoted fields)
      const cols =
        lines[i]
          .match(/(".*?"|[^,]+)(?=,|$)/g)
          ?.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
      if (cols.length < 2) {
        continue;
      }
      transactions.push({
        date: cols[0]?.trim(),
        amount: Number.parseFloat(cols[1]),
        type: cols[2]?.trim() === "Einnahme" ? "income" : "expense",
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
    let existing = await Category.findOne({
      where: { householdId, name: cat.name },
    });
    if (!existing) {
      existing = await Category.create({
        name: cat.name,
        nameDE: cat.nameDE,
        icon: cat.icon || "tag",
        color: cat.color || "#6B7280",
        isSystem: false,
        householdId,
        sortOrder: cat.sortOrder || 0,
      });
    }
    if (cat.id) {
      categoryIdMap[cat.id] = existing.id;
    }
  }

  // Index system categories by name for matching
  const systemCats = await Category.findAll({ where: { isSystem: true } });
  const catByName = {};
  systemCats.forEach((c) => {
    if (c.nameDE) {
      catByName[c.nameDE.toLowerCase()] = c.id;
    }
    catByName[c.name.toLowerCase()] = c.id;
  });

  for (const t of transactions) {
    try {
      const existing = await Transaction.findOne({
        where: {
          householdId,
          date: t.date,
          amount: t.amount,
          type: t.type || "expense",
          description: t.description || null,
        },
      });
      if (existing) {
        stats.skipped++;
        continue;
      }

      let categoryId = null;
      if (t.categoryId && categoryIdMap[t.categoryId]) {
        categoryId = categoryIdMap[t.categoryId];
      } else if (t.categoryName) {
        categoryId = catByName[t.categoryName.toLowerCase()] || null;
      } else if (t.Category) {
        categoryId =
          catByName[
            (t.Category.nameDE || t.Category.name || "").toLowerCase()
          ] || null;
      }

      await Transaction.create({
        amount: t.amount,
        description: t.description || null,
        note: t.note || null,
        date: t.date,
        type: t.type || "expense",
        categoryId,
        householdId,
        userId,
        merchant: t.merchant || null,
        tags: t.tags || [],
        isConfirmed: true,
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
  const SftpClient = require("ssh2-sftp-client");
  const sftp = new SftpClient();

  const connectOpts = {
    host: config.sftpHost,
    port: config.sftpPort || 22,
    username: config.sftpUser,
    readyTimeout: 15_000,
  };

  if (config.sshPrivateKey) {
    // SSH key auth (preferred)
    connectOpts.privateKey = config.sshPrivateKey;
  } else if (config.sftpPassword) {
    connectOpts.password = config.sftpPassword;
  } else {
    throw new Error("Weder Passwort noch SSH-Key konfiguriert");
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
    BackupConfig.findOne({ order: [["createdAt", "DESC"]] }),
    GlobalSettings.findOne({ where: { id: "global" } }),
  ]);
  if (!config?.sftpHost) {
    throw new Error("Keine Backup-Konfiguration vorhanden");
  }

  // Prefer SSH key auth over password
  const sshPrivateKey = globalSettings?.sshPrivateKey || null;

  const data = await exportAllData();
  const compressed = zlib.gzipSync(
    Buffer.from(JSON.stringify(data, null, 2), "utf8")
  );
  const date = new Date().toISOString().split("T")[0];
  const filename = `haushaltsbuch-backup-${date}.json.gz`;

  await uploadToSftp(
    { ...config.toJSON(), sshPrivateKey },
    compressed,
    filename
  );

  await config.update({
    lastRunAt: new Date(),
    lastRunStatus: "success",
    lastRunMessage: `${filename} (${Math.round(compressed.length / 1024)} KB)`,
  });

  return filename;
}

// ── Parse backup file (gzip or plain JSON) ────────────────────────────────────
function parseBackupBuffer(buffer) {
  let json;
  try {
    // Try gzip first
    json = zlib.gunzipSync(buffer).toString("utf8");
  } catch {
    // Fall back to plain JSON
    json = buffer.toString("utf8");
  }
  const data = JSON.parse(json);
  if (!data.tables) {
    throw new Error("Ungültiges Backup-Format (kein tables-Objekt)");
  }
  return data;
}

// ── Restore all data ──────────────────────────────────────────────────────────
async function restoreAllData(data) {
  const { sequelize } = require("../models");
  const t = data.tables;

  const tx = await sequelize.transaction();
  try {
    // Delete in reverse dependency order
    await sequelize.query("DELETE FROM transaction_splits", {
      transaction: tx,
    });
    await sequelize.query("DELETE FROM transactions", { transaction: tx });
    await sequelize.query("DELETE FROM budgets", { transaction: tx });
    await sequelize.query("DELETE FROM savings_goals", { transaction: tx });
    await sequelize.query("DELETE FROM password_reset_tokens", {
      transaction: tx,
    });
    await sequelize.query("DELETE FROM paperless_document_types", {
      transaction: tx,
    });
    await sequelize.query("DELETE FROM paperless_correspondents", {
      transaction: tx,
    });
    await sequelize.query("DELETE FROM paperless_tags", { transaction: tx });
    await sequelize.query("DELETE FROM paperless_users", { transaction: tx });
    await sequelize.query("DELETE FROM paperless_configs", { transaction: tx });
    await sequelize.query("DELETE FROM invite_codes", { transaction: tx });
    await sequelize.query("DELETE FROM household_members", { transaction: tx });
    await sequelize.query("DELETE FROM categories", { transaction: tx });
    await sequelize.query("DELETE FROM households", { transaction: tx });
    await sequelize.query("DELETE FROM users", { transaction: tx });
    await sequelize.query("DELETE FROM global_settings", { transaction: tx });
    await sequelize.query("DELETE FROM backup_configs", { transaction: tx });

    const opts = {
      transaction: tx,
      validate: false,
      hooks: false,
      individualHooks: false,
      returning: false,
    };

    // Re-insert in forward dependency order
    // Users — restore password hash as-is (backup excludes password field — users must reset passwords)
    if (t.users?.length) {
      await sequelize.query(
        `INSERT INTO users (id, name, email, password, role, theme, "aiKeyGranted", "isActive", "createdAt", "updatedAt")
         VALUES ${t.users.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",")}`,
        {
          transaction: tx,
          replacements: t.users.flatMap((u) => [
            u.id,
            u.name,
            u.email,
            "$2b$10$placeholder.hash.that.will.not.work", // users must reset password after restore
            u.role || "member",
            u.theme || "masculine",
            u.aiKeyGranted ?? false,
            u.isActive ?? true,
            u.createdAt || new Date(),
            u.updatedAt || new Date(),
          ]),
        }
      );
    }

    if (t.global_settings?.length) {
      for (const g of t.global_settings) {
        await GlobalSettings.create(
          {
            id: g.id || "global",
            anthropicApiKey: g.anthropicApiKey || null,
            aiKeyPublic: g.aiKeyPublic ?? false,
          },
          { transaction: tx }
        );
      }
    }

    if (t.households?.length) {
      for (const h of t.households) {
        await Household.create(
          {
            id: h.id,
            name: h.name,
            currency: h.currency || "EUR",
            monthlyBudget: h.monthlyBudget || null,
            budgetWarningAt: h.budgetWarningAt || null,
            anthropicApiKey: h.anthropicApiKey || null,
            aiEnabled: h.aiEnabled ?? false,
            adminUserId: h.adminUserId,
          },
          { transaction: tx }
        );
      }
    }

    if (t.household_members?.length) {
      await HouseholdMember.bulkCreate(
        t.household_members.map((m) => ({
          householdId: m.householdId,
          userId: m.userId,
          role: m.role || "member",
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        { ...opts, ignoreDuplicates: true }
      );
    }

    if (t.categories?.length) {
      await Category.bulkCreate(
        t.categories.map((c) => ({
          id: c.id,
          name: c.name,
          nameDE: c.nameDE,
          icon: c.icon,
          color: c.color,
          isSystem: c.isSystem ?? false,
          householdId: c.householdId || null,
          sortOrder: c.sortOrder || 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        { ...opts, ignoreDuplicates: true }
      );
    }

    if (t.transactions?.length) {
      // Insert in chunks to avoid parameter limits
      const CHUNK = 200;
      for (let i = 0; i < t.transactions.length; i += CHUNK) {
        await Transaction.bulkCreate(
          t.transactions.slice(i, i + CHUNK).map((tr) => ({
            id: tr.id,
            amount: tr.amount,
            description: tr.description,
            note: tr.note,
            date: tr.date,
            type: tr.type,
            categoryId: tr.categoryId,
            householdId: tr.householdId,
            userId: tr.userId,
            merchant: tr.merchant,
            tags: tr.tags || [],
            isRecurring: tr.isRecurring ?? false,
            recurringInterval: tr.recurringInterval || null,
            recurringDay: tr.recurringDay || null,
            recurringNextDate: tr.recurringNextDate || null,
            tip: tr.tip || 0,
            createdAt: tr.createdAt,
            updatedAt: tr.updatedAt,
          })),
          { ...opts, ignoreDuplicates: true }
        );
      }
    }

    if (t.budgets?.length) {
      await Budget.bulkCreate(
        t.budgets.map((b) => ({
          id: b.id,
          householdId: b.householdId,
          categoryId: b.categoryId,
          limitAmount: b.limitAmount,
          month: b.month,
          year: b.year,
          warningAt: b.warningAt || null,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        })),
        { ...opts, ignoreDuplicates: true }
      );
    }

    if (t.invite_codes?.length) {
      await InviteCode.bulkCreate(
        t.invite_codes.map((c) => ({
          id: c.id,
          code: c.code,
          type: c.type,
          householdId: c.householdId,
          role: c.role,
          useCount: c.useCount || 0,
          maxUses: c.maxUses || 1,
          expiresAt: c.expiresAt || null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        { ...opts, ignoreDuplicates: true }
      );
    }

    await tx.commit();

    return {
      users: t.users?.length || 0,
      households: t.households?.length || 0,
      categories: t.categories?.length || 0,
      transactions: t.transactions?.length || 0,
      budgets: t.budgets?.length || 0,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = {
  exportAllData,
  exportHouseholdData,
  importHouseholdData,
  uploadToSftp,
  runGlobalBackup,
  parseBackupBuffer,
  restoreAllData,
};
