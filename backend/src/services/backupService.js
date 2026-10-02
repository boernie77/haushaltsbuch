const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  Household,
  Category,
  Transaction,
  Budget,
  GlobalSettings,
  BackupConfig,
} = require("../models");

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

// ── Globales Backup per pg_dump ──────────────────────────────────────────────
// Sichert die komplette Datenbank (alle Tabellen, alle Spalten, inkl.
// Passwort-Hashes und _migrations) im Custom-Format von pg_dump. Verschlüsselte
// Felder bleiben verschlüsselt → zum Wiederherstellen denselben ENCRYPTION_KEY
// verwenden. pg_dump/pg_restore kommen aus postgresql16-client (Dockerfile),
// Version passend zum DB-Image postgres:16.
const PG_DUMP_MAGIC = "PGDMP";
const SAFETY_DIR = path.join(__dirname, "../../uploads/restore-safety");

function databaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ist nicht gesetzt");
  }
  return process.env.DATABASE_URL;
}

// Startet ein PostgreSQL-Werkzeug und liefert stdout als Buffer.
function runPgTool(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      reject(
        err.code === "ENOENT"
          ? new Error(
              `${command} nicht gefunden — Backend-Image neu bauen (postgresql16-client fehlt)`
            )
          : err
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        reject(new Error(`${command} fehlgeschlagen: ${stderr.trim()}`));
      }
    });
  });
}

function createDatabaseDump() {
  return runPgTool("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--dbname=${databaseUrl()}`,
  ]);
}

const isDatabaseDump = (buffer) =>
  buffer.subarray(0, PG_DUMP_MAGIC.length).toString("latin1") ===
  PG_DUMP_MAGIC;

// Dump-Puffer in eine Temp-Datei schreiben (pg_restore liest Dateien).
async function withTempDump(buffer, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hb-restore-"));
  const file = path.join(dir, "backup.dump");
  try {
    await fs.writeFile(file, buffer);
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Inhaltsverzeichnis eines Dumps: Erstellungszeit, DB-Version, Tabellen.
async function inspectDatabaseDump(buffer) {
  if (!isDatabaseDump(buffer)) {
    throw new Error(
      "Keine pg_dump-Datei. Ältere JSON-Backups (bis v1.0.44) waren unvollständig und werden nicht mehr unterstützt — bitte ein neues Backup erstellen."
    );
  }
  return withTempDump(buffer, async (file) => {
    const list = (await runPgTool("pg_restore", ["--list", file])).toString(
      "utf8"
    );
    const tables = [...list.matchAll(/TABLE DATA public (\S+)/g)]
      .map((m) => m[1])
      .sort();
    if (!tables.includes("transactions")) {
      throw new Error("Die Datei ist kein Haushaltsbuch-Backup");
    }
    return {
      createdAt: list.match(/Archive created at (.+)/)?.[1]?.trim() || null,
      serverVersion:
        list.match(/Dumped from database version: (.+)/)?.[1]?.trim() || null,
      tables,
    };
  });
}

// Ersetzt die komplette Datenbank durch den Dump. Vorher wird der aktuelle
// Stand als Sicherheitskopie unter uploads/restore-safety abgelegt. Danach
// laufen die Migrationen, damit ein älteres Backup auf den aktuellen
// Schema-Stand kommt.
async function restoreDatabaseDump(buffer) {
  const info = await inspectDatabaseDump(buffer);

  await fs.mkdir(SAFETY_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyFile = path.join(
    SAFETY_DIR,
    `haushaltsbuch-vor-wiederherstellung-${stamp}.dump`
  );
  await fs.writeFile(safetyFile, await createDatabaseDump());

  await withTempDump(buffer, (file) =>
    runPgTool("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--single-transaction",
      "--exit-on-error",
      `--dbname=${databaseUrl()}`,
      file,
    ])
  );

  const { sequelize } = require("../models");
  const { migrate } = require("../utils/migrate");
  await migrate(sequelize);

  return { ...info, safetyFile: path.basename(safetyFile) };
}

const backupFilename = () =>
  `haushaltsbuch-backup-${new Date().toISOString().split("T")[0]}.dump`;

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

  const dump = await createDatabaseDump();
  const filename = backupFilename();

  await uploadToSftp({ ...config.toJSON(), sshPrivateKey }, dump, filename);

  await config.update({
    lastRunAt: new Date(),
    lastRunStatus: "success",
    lastRunMessage: `${filename} (${Math.round(dump.length / 1024)} KB)`,
  });

  return filename;
}

module.exports = {
  backupFilename,
  createDatabaseDump,
  exportHouseholdData,
  importHouseholdData,
  inspectDatabaseDump,
  restoreDatabaseDump,
  runGlobalBackup,
  uploadToSftp,
};
