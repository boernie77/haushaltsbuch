// Liability-Konten: startingBalance vorzeichenrichtig speichern.
// Konvention: positiv = Guthaben, negativ = Schulden — für ALLE Konten gleich.
// Bisher haben Liability-Konten ihren Startsaldo positiv gespeichert (=Schulden);
// das war inkonsistent zur Buchungsformel (expense reduziert den balance) und
// hat zu falschen Salden geführt, sobald Buchungen auf dem Konto liefen.
//
// One-Shot: positive Liability-Salden werden negiert. Idempotent durch Filter
// "> 0" — bei zweitem Lauf gibt's keine positiven mehr.
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      UPDATE accounts
         SET "startingBalance" = -"startingBalance"
       WHERE type = 'liability' AND "startingBalance" > 0;
    `);
  },
};
