// Gelernte Zuordnungen (merchant_category_mappings) merken sich zusätzlich
// eine Beschreibung. Wird für Schlüssel "Händler|Betrag" gesetzt, damit
// wiederkehrende Zahlungen (z.B. PayPal-Abos) ihre Beschreibung behalten
// (siehe utils/merchantLearning.js).
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE merchant_category_mappings
        ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);
  },
};
