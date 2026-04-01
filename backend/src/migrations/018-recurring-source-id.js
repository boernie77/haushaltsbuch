module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "recurringSourceId" UUID REFERENCES transactions(id) ON DELETE SET NULL
    `);
  },
};
