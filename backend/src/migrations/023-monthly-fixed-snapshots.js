module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS monthly_fixed_snapshots (
        id UUID PRIMARY KEY,
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        "fixedIncome" DECIMAL(10, 2) NOT NULL DEFAULT 0,
        "fixedExpenses" DECIMAL(10, 2) NOT NULL DEFAULT 0,
        balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE ("householdId", year, month)
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_mfs_household_period
        ON monthly_fixed_snapshots ("householdId", year, month);
    `);
  },
};
