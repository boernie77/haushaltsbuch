// Sub-Account-Feature (z.B. Spesen):
// - categories.hasSubAccount        → Kategorie ist ein Sammelbecken
// - transactions.subAccountPeriodMonth/Year → welcher Zeitraum die Buchung
//   betrifft (kann ≠ Buchungs-Datum sein, z.B. Gutschrift für Vor-Periode)
// - transactions.excludeFromStats   → Sub-Account-Buchungen tauchen NICHT
//   in Statistiken auf; nur das Settlement schlägt durch
// - transactions.isSubAccountSettlement → markiert die "Schließen"-Buchung
// - transactions.affectsAccountBalance → für virtuelle Settlement-Buchungen
//   FALSE: sie ändern den Konto-Saldo nicht (Cash-Flow lief schon über die
//   Einzelbuchungen)
// - sub_account_settlements        → Audit-Trail welche Period geschlossen
//   wurde + Verweis auf die Settlement-Buchung
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE categories
        ADD COLUMN IF NOT EXISTS "hasSubAccount" BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "subAccountPeriodMonth" INTEGER,
        ADD COLUMN IF NOT EXISTS "subAccountPeriodYear" INTEGER,
        ADD COLUMN IF NOT EXISTS "excludeFromStats" BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "isSubAccountSettlement" BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "affectsAccountBalance" BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_sub_account
        ON transactions ("categoryId", "subAccountPeriodYear", "subAccountPeriodMonth")
        WHERE "subAccountPeriodMonth" IS NOT NULL;
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sub_account_settlements (
        id UUID PRIMARY KEY,
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        "categoryId" UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        "settlementTransactionId" UUID REFERENCES transactions(id) ON DELETE SET NULL,
        balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
        "settledByUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "settledAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE ("householdId", "categoryId", year, month)
      );
    `);
  },
};
