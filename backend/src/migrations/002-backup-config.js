module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS backup_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "sftpHost" VARCHAR(255),
        "sftpPort" INTEGER NOT NULL DEFAULT 22,
        "sftpUser" VARCHAR(255),
        "sftpPassword" VARCHAR(255),
        "sftpPath" VARCHAR(255) NOT NULL DEFAULT '/backups',
        schedule VARCHAR(100),
        "scheduleLabel" VARCHAR(50),
        "isActive" BOOLEAN NOT NULL DEFAULT false,
        "lastRunAt" TIMESTAMPTZ,
        "lastRunStatus" VARCHAR(20),
        "lastRunMessage" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
};
