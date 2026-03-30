module.exports = {
  up: async (sequelize) => {
    // Duplikate entfernen — ältere Einträge löschen, neuesten behalten
    await sequelize.query(`
      DELETE FROM paperless_document_types
      WHERE id NOT IN (
        SELECT DISTINCT ON ("householdId", "paperlessId") id
        FROM paperless_document_types
        ORDER BY "householdId", "paperlessId", "updatedAt" DESC
      );
    `);
    await sequelize.query(`
      DELETE FROM paperless_correspondents
      WHERE id NOT IN (
        SELECT DISTINCT ON ("householdId", "paperlessId") id
        FROM paperless_correspondents
        ORDER BY "householdId", "paperlessId", "updatedAt" DESC
      );
    `);
    await sequelize.query(`
      DELETE FROM paperless_tags
      WHERE id NOT IN (
        SELECT DISTINCT ON ("householdId", "paperlessId") id
        FROM paperless_tags
        ORDER BY "householdId", "paperlessId", "updatedAt" DESC
      );
    `);

    // Unique Constraints setzen (falls noch nicht vorhanden)
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'paperless_document_types_household_paperless_unique'
        ) THEN
          ALTER TABLE paperless_document_types ADD CONSTRAINT paperless_document_types_household_paperless_unique UNIQUE ("householdId", "paperlessId");
        END IF;
      END $$;
    `);
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'paperless_correspondents_household_paperless_unique'
        ) THEN
          ALTER TABLE paperless_correspondents ADD CONSTRAINT paperless_correspondents_household_paperless_unique UNIQUE ("householdId", "paperlessId");
        END IF;
      END $$;
    `);
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'paperless_tags_household_paperless_unique'
        ) THEN
          ALTER TABLE paperless_tags ADD CONSTRAINT paperless_tags_household_paperless_unique UNIQUE ("householdId", "paperlessId");
        END IF;
      END $$;
    `);
  }
};
