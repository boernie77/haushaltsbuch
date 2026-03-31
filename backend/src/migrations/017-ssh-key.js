module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE global_settings
        ADD COLUMN IF NOT EXISTS "sshPublicKey"  TEXT,
        ADD COLUMN IF NOT EXISTS "sshPrivateKey" TEXT
    `);
  },
};
