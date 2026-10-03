// Bank-Sync: Import-Protokoll. Jeder Datei-Import wird mit Konto, Datei,
// Zeitraum der Datei (von–bis) und Ergebnis gespeichert. Daraus zeigt die
// Bank-Sync-Seite pro Konto, welche Zeiträume abgedeckt sind und wo Lücken
// sind (routes/bankSync.js GET /imports).
//
// Für Importe vor dieser Migration gibt es kein Protokoll. Sie werden einmalig
// aus den verknüpften Buchungen abgeleitet ("derived"): zusammenhängende
// Abschnitte, getrennt wo zwischen zwei importierten Umsätzen mehr als 14 Tage
// liegen. Das ist nur eine Näherung (ruhige Wochen ohne Umsatz sehen aus wie
// eine Lücke) und wird in der UI so gekennzeichnet.
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
const DERIVED_GAP_DAYS = 14;

module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS bank_imports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        "accountId" UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "fileName" TEXT,
        format TEXT,
        "dateFrom" DATE NOT NULL,
        "dateTo" DATE NOT NULL,
        "rowCount" INTEGER NOT NULL DEFAULT 0,
        imported INTEGER NOT NULL DEFAULT 0,
        merged INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        derived BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_imports_account
        ON bank_imports ("accountId", "dateFrom");
    `);

    // Nachträglich ableiten — nur beim ersten Lauf (Tabelle noch leer).
    await sequelize.query(`
      WITH linked AS (
        SELECT a."householdId", a.id AS "accountId", t.date
        FROM accounts a
        JOIN transactions t
          ON (t."accountId" = a.id AND t."externalRef" IS NOT NULL)
          OR (t."transferTargetAccountId" = a.id
              AND t."transferExternalRef" IS NOT NULL)
      ),
      marked AS (
        SELECT *,
          CASE WHEN date - lag(date) OVER (PARTITION BY "accountId" ORDER BY date)
                    > ${DERIVED_GAP_DAYS}
               THEN 1 ELSE 0 END AS "isBreak"
        FROM linked
      ),
      grouped AS (
        SELECT *,
          sum("isBreak") OVER (PARTITION BY "accountId" ORDER BY date
                               ROWS UNBOUNDED PRECEDING) AS grp
        FROM marked
      )
      INSERT INTO bank_imports
        ("householdId", "accountId", "dateFrom", "dateTo", "rowCount",
         imported, derived, "createdAt", "updatedAt")
      SELECT "householdId", "accountId", min(date), max(date), count(*),
             count(*), TRUE, NOW(), NOW()
      FROM grouped
      WHERE NOT EXISTS (SELECT 1 FROM bank_imports)
      GROUP BY "householdId", "accountId", grp;
    `);
  },
};
