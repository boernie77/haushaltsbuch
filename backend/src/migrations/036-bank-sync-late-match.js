// Bank-Sync: späte Abbuchung. Spesen-/Rechnungs-Ausgaben werden oft erst
// Wochen nach der Erfassung abgebucht (Zahlungsziel, PayPal, Klarna). Pro
// Haushaltsbuch lässt sich je Kategorie einstellen, wie viele Tage NACH der
// Buchung die Abbuchung noch kommen darf, damit beide verknüpft werden.
// households."bankSyncLateMatchDays": JSON { "<categoryId>": Tage }. Fehlt
// eine Kategorie, gilt der Standard (Sub-Konto-Kategorien 45, sonst ±5).
// Bewusst pro Haushaltsbuch statt an der Kategorie: Systemkategorien sind
// global, eine Einstellung dort würde alle Haushalte betreffen.
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS "bankSyncLateMatchDays" TEXT;
    `);
  },
};
