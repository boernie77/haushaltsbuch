// Kalender-Feature: Konten bekommen ein Datum für ihren Anfangsbestand.
// "startingBalanceDate" = der Tag, auf den sich startingBalance bezieht.
// Buchungen VOR diesem Datum gelten als bereits im Anfangsbestand enthalten
// und werden bei der Saldo-Berechnung ab diesem Datum ignoriert (siehe
// accounts.js#computeBalance). NULL = wie bisher (alle Buchungen zählen).
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS "startingBalanceDate" DATE;
    `);
  },
};
