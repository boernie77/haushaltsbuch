module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "isPersonal" BOOLEAN NOT NULL DEFAULT false
    `);
  }
};
