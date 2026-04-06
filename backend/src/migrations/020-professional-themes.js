module.exports = {
  up: async (sequelize) => {
    await sequelize.query(
      `ALTER TYPE "enum_users_theme" ADD VALUE IF NOT EXISTS 'professional-light'`
    );
    await sequelize.query(
      `ALTER TYPE "enum_users_theme" ADD VALUE IF NOT EXISTS 'professional-dark'`
    );
  },
};
