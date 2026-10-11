// Bankname zum FinTS-Zugang (aus der Bankenliste vorgeschlagen, änderbar).
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(
      `ALTER TABLE fints_connections ADD COLUMN IF NOT EXISTS "bankName" TEXT`
    );
  },
};
