// Bank-Sync-Feature (manueller CSV/MT940-Datei-Import, siehe
// utils/bankImport.js + routes/bankSync.js):
// - bank_import_profiles       → merkt sich pro Konto die zuletzt bestätigte
//   CSV-Spalten-Zuordnung, damit der User sie nicht jedes Mal neu eingeben muss
// - merchant_category_mappings → lernt "Verwendungszweck/Merchant → Kategorie"
//   aus manuellen Zuordnungen importierter Buchungen (siehe transactions.js PUT)
// - transactions."externalRef" → Dedup-Schlüssel (Hash aus Datum+Betrag+
//   Verwendungszweck+Gegenkonto) verhindert Doppelimport bei wiederholtem Import
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS bank_import_profiles (
        id UUID PRIMARY KEY,
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        "accountId" UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        format TEXT NOT NULL,
        "columnMapping" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE ("householdId", "accountId")
      );
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS merchant_category_mappings (
        id UUID PRIMARY KEY,
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        "merchantPattern" TEXT NOT NULL,
        "categoryId" UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE ("householdId", "merchantPattern")
      );
    `);
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_ref
        ON transactions ("accountId", "externalRef")
        WHERE "externalRef" IS NOT NULL;
    `);
  },
};
