module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS paperless_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL,
        "paperlessId" INTEGER NOT NULL,
        username VARCHAR(255) NOT NULL,
        "fullName" VARCHAR(255),
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        "syncedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE("householdId", "paperlessId")
      );
    `);
  }
};
