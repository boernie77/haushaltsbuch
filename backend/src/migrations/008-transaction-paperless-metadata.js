module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "paperlessMetadata" TEXT;
    `);
  }
};
