// Bank-Sync: Abgleich importierter Umsätze mit Paperless-Dokumenten
// (Rechnungen/Belege, siehe utils/paperlessMatcher.js). Standard an — greift
// nur, wenn für das Haushaltsbuch Paperless eingerichtet ist.
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS "bankSyncMatchPaperless" BOOLEAN NOT NULL DEFAULT true;
    `);
  },
};
