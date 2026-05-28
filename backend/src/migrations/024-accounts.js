// Konten-Feature: pro Haushaltsbuch eigene Konten (Giro, Kreditkarte, ...)
// - Neue Tabelle "accounts"
// - transactions bekommt accountId + transferTargetAccountId
// - Auto-Default "Hauptkonto" (type=asset) pro Haushalt; alle bestehenden
//   Buchungen werden diesem zugeordnet, damit kein Saldo-Bruch entsteht.
const { randomUUID } = require("node:crypto");

module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY,
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'asset',
        icon VARCHAR(50) DEFAULT '💳',
        color VARCHAR(7) DEFAULT '#3B82F6',
        "startingBalance" DECIMAL(12, 2) NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_accounts_household
        ON accounts ("householdId");
    `);

    // Spalten an transactions ergänzen (camelCase, da Sequelize nicht
    // underscored: true verwendet — SIEHE CLAUDE.md "Spaltenname in
    // Migrations").
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "accountId" UUID
          REFERENCES accounts(id) ON DELETE SET NULL;
    `);
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "transferTargetAccountId" UUID
          REFERENCES accounts(id) ON DELETE SET NULL;
    `);

    // Default-Konto "Hauptkonto" pro Haushalt anlegen — nur wenn noch
    // kein Konto existiert. Idempotent, damit erneute Migration nicht
    // doppelt erzeugt.
    const households = await sequelize.query(
      `SELECT id FROM households WHERE id NOT IN (SELECT "householdId" FROM accounts)`,
      { type: sequelize.QueryTypes.SELECT }
    );
    for (const h of households) {
      const accountId = randomUUID();
      const now = new Date().toISOString();
      await sequelize.query(
        `INSERT INTO accounts
          (id, "householdId", name, type, icon, color, "startingBalance",
           "isActive", "sortOrder", "createdAt", "updatedAt")
         VALUES (:id, :hid, 'Hauptkonto', 'asset', '🏦', '#3B82F6',
                 0, TRUE, 0, :now, :now)`,
        { replacements: { id: accountId, hid: h.id, now } }
      );
      // Alle bestehenden Buchungen dieses Haushalts dem Hauptkonto
      // zuordnen, sofern accountId noch NULL ist.
      await sequelize.query(
        `UPDATE transactions
           SET "accountId" = :accountId
         WHERE "householdId" = :hid AND "accountId" IS NULL`,
        { replacements: { accountId, hid: h.id } }
      );
    }
  },
};
