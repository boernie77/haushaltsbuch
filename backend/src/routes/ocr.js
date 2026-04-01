const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { auth } = require("../middleware/auth");
const {
  Category,
  Household,
  HouseholdMember,
  GlobalSettings,
  User,
} = require("../models");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../../uploads/temp");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) =>
    cb(null, `ocr_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Key priority: 1. Household own key  2. Global key (if user has access)  3. Server env
async function resolveApiKey(householdId, userId) {
  // 1. Household's own key
  if (householdId) {
    const member = await HouseholdMember.findOne({
      where: { householdId, userId },
    });
    if (!member) {
      return null;
    }
    const household = await Household.findByPk(householdId);
    if (household?.aiEnabled && household?.anthropicApiKey) {
      return household.anthropicApiKey;
    }
  }

  // 2. Global key — available if public OR if this user has been granted access
  const global = await GlobalSettings.findByPk("global");
  if (global?.anthropicApiKey) {
    if (global.aiKeyPublic) {
      return global.anthropicApiKey;
    }
    const user = await User.findByPk(userId, { attributes: ["aiKeyGranted"] });
    if (user?.aiKeyGranted) {
      return global.anthropicApiKey;
    }
  }

  // 3. Server env fallback
  return process.env.ANTHROPIC_API_KEY || null;
}

// GET /api/ocr/status?householdId=
router.get("/status", auth, async (req, res) => {
  const apiKey = await resolveApiKey(req.query.householdId, req.user.id);
  res.json({ available: !!apiKey });
});

// POST /api/ocr/analyze
router.post("/analyze", auth, upload.single("receipt"), async (req, res) => {
  const cleanup = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
  };

  if (!req.file) {
    return res.status(400).json({ error: "No image provided" });
  }

  const apiKey = await resolveApiKey(req.body.householdId, req.user.id);
  if (!apiKey) {
    cleanup();
    return res.status(503).json({
      error: "ocr_not_configured",
      message:
        "KI-Analyse nicht aktiviert. Bitte in den Einstellungen einen API-Key hinterlegen.",
    });
  }

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const categories = await Category.findAll({ where: { isSystem: true } });
    const categoryList = categories
      .map((c) => `${c.id}: ${c.nameDE || c.name}`)
      .join(", ");

    const { processReceiptImage } = require("../utils/receiptProcessor");
    const processedBuffer = await processReceiptImage(req.file.path);
    const base64Image = processedBuffer.toString("base64");
    const mimeType = "image/jpeg";

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Heute ist der ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}. Analysiere diesen Kassenbon/diese Quittung und extrahiere folgende Informationen als JSON:
{
  "amount": <Gesamtbetrag als Zahl, z.B. 12.50>,
  "merchant": "<Name des Händlers/Geschäfts>",
  "date": "<Datum im Format YYYY-MM-DD — nutze das heutige Jahr wenn das Jahr auf dem Bon fehlt oder unklar ist, oder null>",
  "description": "<1-3 Wörter, Oberbegriff des Kaufs, z.B. 'Lebensmitteleinkauf', 'Restaurantbesuch', 'Tankfüllung', 'Apotheke' — KEINE Artikelliste>",
  "categoryId": "<passende Kategorie-ID aus dieser Liste: ${categoryList}>",
  "confidence": <0-100, wie sicher bist du>
}
Antworte NUR mit dem JSON-Objekt, ohne Erklärung.`,
            },
          ],
        },
      ],
    });

    cleanup();
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON in response");
    }
    res.json({ result: JSON.parse(jsonMatch[0]) });
  } catch (err) {
    cleanup();
    console.error("OCR error:", err);
    res.status(500).json({ error: "OCR analysis failed: " + err.message });
  }
});

module.exports = router;
