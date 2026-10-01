// Bank-Sync: Umbuchungen zwischen eigenen Konten (z.B. Girokonto →
// Kreditkarte) statt Ausgabe/Einnahme importieren.
// - transactions."transferExternalRef": Dedup-Hash des Bankumsatzes auf der
//   ZIEL-Seite einer Umbuchung ("externalRef" bleibt die Quell-Seite). So ist
//   eine Umbuchung mit beiden Kontoauszügen verknüpft und wird beim Import
//   der zweiten Datei nicht doppelt angelegt.
// - accounts.iban: optional; Überweisungen auf eine eigene IBAN werden als
//   Umbuchung erkannt.
// - bank_categorization_rules / merchant_category_mappings: "targetAccountId"
//   statt Kategorie → Treffer wird Umbuchung auf dieses Konto. Daher wird
//   "categoryId" nullable (genau eins von beiden ist gesetzt).
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "transferExternalRef" TEXT;
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_transfer_external_ref
        ON transactions ("transferTargetAccountId", "transferExternalRef")
        WHERE "transferExternalRef" IS NOT NULL;
    `);
    await sequelize.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS iban TEXT;
    `);
    await sequelize.query(`
      ALTER TABLE bank_categorization_rules
        ADD COLUMN IF NOT EXISTS "targetAccountId" UUID
          REFERENCES accounts(id) ON DELETE CASCADE,
        ALTER COLUMN "categoryId" DROP NOT NULL;
    `);
    await sequelize.query(`
      ALTER TABLE merchant_category_mappings
        ADD COLUMN IF NOT EXISTS "targetAccountId" UUID
          REFERENCES accounts(id) ON DELETE CASCADE,
        ALTER COLUMN "categoryId" DROP NOT NULL;
    `);
  },
};
