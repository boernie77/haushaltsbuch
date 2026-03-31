module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS "emailReportsEnabled" BOOLEAN NOT NULL DEFAULT false
    `);
  }
};
