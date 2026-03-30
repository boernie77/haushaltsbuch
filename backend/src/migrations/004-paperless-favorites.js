module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE paperless_document_types ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE paperless_correspondents   ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE paperless_tags             ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;
    `);
  }
};
