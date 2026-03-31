module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS "monthStartDay" INTEGER NOT NULL DEFAULT 1
    `);
  }
};
