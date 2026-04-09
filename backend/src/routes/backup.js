const router = require("express").Router();
const multer = require("multer");
const { auth } = require("../middleware/auth");
const { HouseholdMember } = require("../models");
const {
  exportHouseholdData,
  importHouseholdData,
} = require("../services/backupService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// GET /api/backup/export?householdId=&format=json|csv
router.get("/export", auth, async (req, res) => {
  const { householdId, format = "json" } = req.query;
  if (!householdId) {
    return res.status(400).json({ error: "householdId required" });
  }

  const member = await HouseholdMember.findOne({
    where: { householdId, userId: req.user.id },
  });
  if (!member) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const data = await exportHouseholdData(householdId, format);
    const date = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="haushalt-export-${date}.csv"`
      );
      return res.send("\uFEFF" + data); // UTF-8 BOM for Excel
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="haushalt-export-${date}.json"`
    );
    return res.json(data);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Export fehlgeschlagen: " + err.message });
  }
});

// POST /api/backup/import
router.post("/import", auth, upload.single("file"), async (req, res) => {
  const { householdId } = req.body;
  if (!householdId) {
    return res.status(400).json({ error: "householdId required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Keine Datei hochgeladen" });
  }

  const member = await HouseholdMember.findOne({
    where: { householdId, userId: req.user.id },
  });
  if (!member || member.role === "viewer") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const content = req.file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    const isCSV = req.file.originalname.toLowerCase().endsWith(".csv");
    const data = isCSV ? content : JSON.parse(content);
    const stats = await importHouseholdData(householdId, data, req.user.id);
    res.json({ message: "Import abgeschlossen", ...stats });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Import fehlgeschlagen: " + err.message });
  }
});

module.exports = router;
