module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "tip" DECIMAL(10,2) NOT NULL DEFAULT 0`);
  }
};
