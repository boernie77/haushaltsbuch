module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "oidcSubject" VARCHAR(255);
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_subject_unique
        ON users("oidcSubject")
        WHERE "oidcSubject" IS NOT NULL;
    `);
  },
};
