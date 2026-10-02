module.exports = {
  up: async (sequelize) => {
    // Nur ausführen wenn der ENUM-Typ existiert (Upgrade bestehender Instanzen).
    // Auf Frisch-Installs ist theme ein VARCHAR — Migration ist dann No-Op.
    const [rows] = await sequelize.query(
      `SELECT 1 FROM pg_type WHERE typname = 'enum_users_theme'`
    );
    if (rows.length === 0) return;
    await sequelize.query(
      `ALTER TYPE "enum_users_theme" ADD VALUE IF NOT EXISTS 'professional-light'`
    );
    await sequelize.query(
      `ALTER TYPE "enum_users_theme" ADD VALUE IF NOT EXISTS 'professional-dark'`
    );
  },
};
