module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS savings_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        "targetAmount" DECIMAL(10,2) NOT NULL,
        "savedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
        "targetDate" DATE,
        icon VARCHAR(10) NOT NULL DEFAULT '🎯',
        color VARCHAR(7) NOT NULL DEFAULT '#E91E8C',
        "isCompleted" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
};
