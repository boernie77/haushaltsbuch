module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transaction_splits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "transactionId" UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        "categoryId" UUID REFERENCES categories(id) ON DELETE SET NULL,
        amount DECIMAL(10,2) NOT NULL,
        description VARCHAR(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS "targetHouseholdId" UUID REFERENCES households(id) ON DELETE SET NULL
    `);
    // Extend ENUM for transfer type
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_transactions_type" ADD VALUE IF NOT EXISTS 'transfer';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
  }
};
