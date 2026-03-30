module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "recurringInterval" VARCHAR(20) DEFAULT NULL;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "recurringDay" INTEGER DEFAULT NULL;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "recurringNextDate" DATE DEFAULT NULL;
    `);
  }
};
