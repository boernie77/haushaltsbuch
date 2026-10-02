// Verschlüsselt beim Start alle sensiblen Felder, die noch im Klartext in der
// DB stehen (z.B. aus der Zeit, bevor ENCRYPTION_KEY gesetzt war). Idempotent:
// bereits verschlüsselte Werte werden übersprungen.
const { encrypt, hasKey, isEncrypted } = require("./encrypt");

const ENCRYPTED_FIELDS = [
  ["Household", ["anthropicApiKey", "bankSyncLocalApiKey"]],
  ["PaperlessConfig", ["apiToken"]],
  ["BackupConfig", ["sftpPassword"]],
  ["GlobalSettings", ["anthropicApiKey", "sshPrivateKey"]],
];

async function encryptExistingSecrets(models) {
  if (!hasKey()) {
    console.warn(
      "[encrypt] ⚠️ ENCRYPTION_KEY fehlt oder ist ungültig (64 Hex-Zeichen) — API-Keys, Tokens und Passwörter werden im KLARTEXT gespeichert. Schlüssel erzeugen: openssl rand -hex 32"
    );
    return;
  }
  let count = 0;
  for (const [modelName, fields] of ENCRYPTED_FIELDS) {
    const Model = models[modelName];
    // raw: true umgeht die Getter → gespeicherter Rohwert.
    const rows = await Model.findAll({
      attributes: ["id", ...fields],
      raw: true,
    });
    for (const row of rows) {
      const plain = fields.filter((f) => row[f] && !isEncrypted(row[f]));
      if (plain.length === 0) {
        continue;
      }
      try {
        const instance = await Model.findByPk(row.id);
        for (const field of plain) {
          instance.setDataValue(field, encrypt(row[field]));
          instance.changed(field, true);
        }
        await instance.save({ fields: plain, hooks: false, validate: false });
        count += plain.length;
      } catch (err) {
        // Einzelne Zeile überspringen, Klartext bleibt lesbar (decrypt
        // liefert Nicht-verschlüsseltes unverändert zurück).
        console.error(
          `[encrypt] ${modelName} ${row.id} (${plain.join(", ")}) nicht verschlüsselt: ${err.message}`
        );
      }
    }
  }
  if (count > 0) {
    console.log(`[encrypt] ${count} Klartext-Wert(e) nachträglich verschlüsselt`);
  }
}

module.exports = { encryptExistingSecrets };
