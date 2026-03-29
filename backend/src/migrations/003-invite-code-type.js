module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'add_member'
    `);
  }
};
