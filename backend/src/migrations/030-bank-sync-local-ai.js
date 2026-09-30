// Bank-Sync-KI: neben Claude auch ein selbst betriebener KI-Server mit
// OpenAI-kompatibler Schnittstelle (Ollama, LM Studio, vLLM, llama.cpp, …).
// - bankSyncAiProvider: "anthropic" | "openai_compatible"
// - bankSyncLocalUrl:   Basis-URL inkl. /v1, z.B. http://192.168.1.10:11434/v1
// - bankSyncLocalModel: Modellname auf dem Server, z.B. "qwen2.5:7b"
// - bankSyncLocalApiKey: optional (verschlüsselt, siehe utils/encrypt.js)
// camelCase + Anführungszeichen — siehe CLAUDE.md "Spaltenname in Migrations".
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS "bankSyncAiProvider" TEXT NOT NULL DEFAULT 'anthropic',
        ADD COLUMN IF NOT EXISTS "bankSyncLocalUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "bankSyncLocalModel" TEXT,
        ADD COLUMN IF NOT EXISTS "bankSyncLocalApiKey" TEXT;
    `);
  },
};
