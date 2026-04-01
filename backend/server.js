require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { sequelize } = require("./src/models");
const { migrate } = require("./src/utils/migrate");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/users", require("./src/routes/users"));
app.use("/api/households", require("./src/routes/households"));
app.use("/api/transactions", require("./src/routes/transactions"));
app.use("/api/categories", require("./src/routes/categories"));
app.use("/api/budgets", require("./src/routes/budgets"));
app.use("/api/statistics", require("./src/routes/statistics"));
app.use("/api/paperless", require("./src/routes/paperless"));
app.use("/api/admin", require("./src/routes/admin"));
app.use("/api/ocr", require("./src/routes/ocr"));
app.use("/api/backup", require("./src/routes/backup"));
app.use("/api/savings-goals", require("./src/routes/savingsGoals"));
app.use("/api/reports", require("./src/routes/reports").router);

// Health check — DB-Verbindung wird verifiziert
app.get("/api/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({
      status: "error",
      db: "unreachable",
      timestamp: new Date().toISOString(),
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

async function checkConfig() {
  try {
    const {
      Household,
      PaperlessConfig,
      GlobalSettings,
      HouseholdMember,
    } = require("./src/models");
    const households = await Household.findAll();
    const paperlessConfigs = await PaperlessConfig.findAll({
      where: { isActive: true },
    });
    const configuredIds = new Set(paperlessConfigs.map((c) => c.householdId));

    console.log("[config] ── Konfigurationscheck ──────────────────────");
    console.log(`[config] Haushaltsbücher gesamt: ${households.length}`);

    for (const h of households) {
      const hasPaperless = configuredIds.has(h.id);
      const hasAI = h.aiEnabled && !!h.anthropicApiKey;
      const memberCount = await HouseholdMember.count({
        where: { householdId: h.id },
      });
      const flags = [
        hasPaperless ? "✅ Paperless" : "⚠️  Paperless fehlt",
        hasAI
          ? "✅ KI-Key"
          : h.aiEnabled
            ? "⚠️  KI aktiv aber kein Key"
            : "—  KI deaktiviert",
        `👥 ${memberCount} Mitglied(er)`,
      ];
      console.log(`[config]   "${h.name}": ${flags.join("  |  ")}`);
    }

    const global = await GlobalSettings.findOne({ where: { id: "global" } });
    if (global?.anthropicApiKey) {
      console.log(
        `[config] Globaler KI-Key: ✅ vorhanden (öffentlich: ${global.aiKeyPublic ? "ja" : "nein"})`
      );
    } else {
      console.log("[config] Globaler KI-Key: ⚠️  nicht gesetzt");
    }
    console.log("[config] ───────────────────────────────────────────");
  } catch (e) {
    console.warn("[config] Konfigurationscheck fehlgeschlagen:", e.message);
  }
}

// Start: run migrations, then listen, then start cron
migrate(sequelize)
  .then(async () => {
    await checkConfig();
    app.listen(PORT, () => {
      console.log(`Haushaltsbuch API running on port ${PORT}`);
    });
    // Start backup cron job if configured
    const { startCron } = require("./src/services/cronService");
    startCron().catch((e) => console.error("[cron]", e.message));
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
