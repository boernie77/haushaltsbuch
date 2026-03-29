// Initial schema — uses IF NOT EXISTS throughout so it's safe on existing databases.
// On a fresh DB this creates everything; on the existing VPS it's a no-op.
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        theme VARCHAR(20) NOT NULL DEFAULT 'feminine',
        avatar VARCHAR(255),
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastLoginAt" TIMESTAMPTZ,
        "inviteCode" VARCHAR(255),
        "aiKeyGranted" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS households (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
        "monthlyBudget" DECIMAL(10,2),
        "budgetWarningAt" INTEGER NOT NULL DEFAULT 80,
        "isShared" BOOLEAN NOT NULL DEFAULT false,
        "adminUserId" UUID NOT NULL,
        "anthropicApiKey" VARCHAR(255),
        "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS household_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        "nameDE" VARCHAR(255),
        icon VARCHAR(255) NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#6B7280',
        "isSystem" BOOLEAN NOT NULL DEFAULT true,
        "householdId" UUID,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        amount DECIMAL(10,2) NOT NULL,
        description VARCHAR(255),
        note TEXT,
        date DATE NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'expense',
        "categoryId" UUID,
        "householdId" UUID NOT NULL,
        "userId" UUID NOT NULL,
        "receiptImage" VARCHAR(255),
        "receiptRaw" TEXT,
        "paperlessDocId" INTEGER,
        "isConfirmed" BOOLEAN NOT NULL DEFAULT true,
        merchant VARCHAR(255),
        tags TEXT[] NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL,
        "categoryId" UUID,
        "limitAmount" DECIMAL(10,2) NOT NULL,
        month INTEGER,
        year INTEGER NOT NULL,
        "warningAt" INTEGER NOT NULL DEFAULT 80,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS paperless_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL UNIQUE,
        "baseUrl" VARCHAR(255) NOT NULL,
        "apiToken" VARCHAR(255) NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS paperless_document_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL,
        "paperlessId" INTEGER,
        name VARCHAR(255) NOT NULL,
        "syncedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS paperless_correspondents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL,
        "paperlessId" INTEGER,
        name VARCHAR(255) NOT NULL,
        "syncedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS paperless_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "householdId" UUID NOT NULL,
        "paperlessId" INTEGER,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(7),
        "syncedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        id VARCHAR(255) PRIMARY KEY DEFAULT 'global',
        "anthropicApiKey" VARCHAR(255),
        "aiKeyPublic" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(255) NOT NULL UNIQUE,
        "householdId" UUID,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        "createdById" UUID NOT NULL,
        "usedById" UUID,
        "usedAt" TIMESTAMPTZ,
        "expiresAt" TIMESTAMPTZ,
        "maxUses" INTEGER NOT NULL DEFAULT 1,
        "useCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
};
