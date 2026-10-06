// FinTS-Zugang pro Konto (Bank-Sync per FinTS/HBCI statt Dateiimport).
// PIN ist optional und wird verschlüsselt gespeichert (TEXT, siehe encrypt.js).
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS fints_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        "accountId" UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "bankCode" TEXT NOT NULL,
        "fintsUrl" TEXT NOT NULL,
        "loginName" TEXT NOT NULL,
        pin TEXT,
        "tanMethod" TEXT,
        "tanMedium" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("accountId")
      )
    `);
  },
};
