module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "subscriptionType" VARCHAR(20) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "subscriptionActive" BOOLEAN NOT NULL DEFAULT FALSE
    `);
  },
};
