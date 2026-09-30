// Schnellerfassung (Mobile): pro Mitglied + Haushaltsbuch selbst gewählte und
// sortierte Kategorie-Kacheln. JSON {"expense": [categoryId, …],
// "income": [categoryId, …]}. NULL/leere Liste = automatisch nach Nutzung
// (siehe routes/transactions.js GET /quick-categories).
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE household_members
        ADD COLUMN IF NOT EXISTS "quickCategories" TEXT;
    `);
  },
};
