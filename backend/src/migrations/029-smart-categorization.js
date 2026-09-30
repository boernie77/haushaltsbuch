// Intelligente Zuordnung beim Bank-Sync-Import (siehe routes/bankSync.js +
// utils/bankCategorizer.js):
// - transactions."pendingBankMatch" → Schnellerfassung (Mobile), die beim
//   nächsten Import mit dem passenden Bankumsatz verschmolzen werden soll
// - bank_categorization_rules → vom User gepflegte Regeln ("enthält REWE",
//   IBAN, Betragsbereich) → Kategorie/Beschreibung
// - households.bankSync* → pro Haushaltsbuch schaltbare Zuordnungs-Quellen
//   (KI standardmäßig AUS, sendet Buchungsdaten an Anthropic)
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "pendingBankMatch" BOOLEAN NOT NULL DEFAULT false;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_pending_bank_match
        ON transactions ("householdId")
        WHERE "pendingBankMatch" = true;
    `);
    await sequelize.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS "bankSyncMatchQuickEntries" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "bankSyncRulesEnabled" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "bankSyncAiEnabled" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "bankSyncAiModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
        ADD COLUMN IF NOT EXISTS "bankSyncAiDescriptions" BOOLEAN NOT NULL DEFAULT false;
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS bank_categorization_rules (
        id UUID PRIMARY KEY,
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        field TEXT NOT NULL DEFAULT 'any',
        pattern TEXT NOT NULL,
        "minAmount" DECIMAL(10, 2),
        "maxAmount" DECIMAL(10, 2),
        "categoryId" UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        description TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_categorization_rules_household
        ON bank_categorization_rules ("householdId");
    `);
  },
};
