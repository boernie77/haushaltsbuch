module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_household_id ON transactions("householdId");
      CREATE INDEX IF NOT EXISTS idx_transactions_household_date ON transactions("householdId", "date");
      CREATE INDEX IF NOT EXISTS idx_transactions_household_type_date ON transactions("householdId", "type", "date");
      CREATE INDEX IF NOT EXISTS idx_transactions_household_recurring ON transactions("householdId", "isRecurring");
      CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions("categoryId");
      CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id ON transaction_splits("transactionId");
      CREATE INDEX IF NOT EXISTS idx_budgets_household_year_month ON budgets("householdId", "year", "month");
      CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members("userId");
      CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON household_members("householdId");
      CREATE INDEX IF NOT EXISTS idx_paperless_doc_types_household ON paperless_document_types("householdId");
      CREATE INDEX IF NOT EXISTS idx_paperless_correspondents_household ON paperless_correspondents("householdId");
      CREATE INDEX IF NOT EXISTS idx_paperless_tags_household ON paperless_tags("householdId");
    `);
  }
};
