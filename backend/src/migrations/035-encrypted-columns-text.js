// Verschlüsselte Werte ("iv:authTag:data" in Hex) sind gut doppelt so lang wie
// der Klartext — ein Anthropic-Key passt dann nicht mehr in VARCHAR(255).
// Die Modelle definieren diese Spalten längst als TEXT, die frühen Migrationen
// legten sie aber als VARCHAR(255) an. VARCHAR → TEXT ist verlustfrei.
module.exports = {
  up: async (sequelize) => {
    for (const [table, column] of [
      ["households", "anthropicApiKey"],
      ["global_settings", "anthropicApiKey"],
      ["paperless_configs", "apiToken"],
      ["backup_configs", "sftpPassword"],
    ]) {
      await sequelize.query(
        `ALTER TABLE ${table} ALTER COLUMN "${column}" TYPE TEXT;`
      );
    }
  },
};
