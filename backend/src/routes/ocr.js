const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const { Category } = require('../models');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `ocr_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/ocr/status — check if OCR is available
router.get('/status', auth, (req, res) => {
  res.json({ available: !!process.env.ANTHROPIC_API_KEY });
});

// POST /api/ocr/analyze — analyze receipt image (requires ANTHROPIC_API_KEY)
router.post('/analyze', auth, upload.single('receipt'), async (req, res) => {
  // Clean up helper
  const cleanup = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    cleanup();
    return res.status(503).json({
      error: 'OCR not configured',
      message: 'Kein API-Key konfiguriert. Bitte manuell eingeben.'
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const categories = await Category.findAll({ where: { isSystem: true } });
    const categoryList = categories.map(c => `${c.id}: ${c.nameDE || c.name}`).join(', ');

    const base64Image = fs.readFileSync(req.file.path).toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          {
            type: 'text',
            text: `Analysiere diesen Kassenbon/diese Quittung und extrahiere folgende Informationen als JSON:
{
  "amount": <Gesamtbetrag als Zahl, z.B. 12.50>,
  "merchant": "<Name des Händlers/Geschäfts>",
  "date": "<Datum im Format YYYY-MM-DD, oder null>",
  "description": "<kurze Beschreibung des Einkaufs>",
  "categoryId": "<passende Kategorie-ID aus dieser Liste: ${categoryList}>",
  "confidence": <0-100, wie sicher bist du>
}
Antworte NUR mit dem JSON-Objekt, ohne Erklärung.`
          }
        ]
      }]
    });

    cleanup();

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    res.json({ result: JSON.parse(jsonMatch[0]) });
  } catch (err) {
    cleanup();
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR analysis failed: ' + err.message });
  }
});

module.exports = router;
