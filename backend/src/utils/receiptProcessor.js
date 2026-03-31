const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Verarbeitet ein Quittungsbild zu einem klaren Dokumenten-Scan:
 * - Rand/Hintergrund: sauber weiß (via Threshold-Maske)
 * - Textbereich: sanftere Verarbeitung für bessere Lesbarkeit
 * Zwei Durchgänge werden per Compositing kombiniert.
 */
async function processReceiptImage(inputPath) {
  // Basis: rotiert, skaliert, Graustufen, normalisiert, CLAHE
  const base = await sharp(inputPath)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .greyscale()
    .normalize()
    .clahe({ width: 4, height: 4, maxSlope: 3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = base;

  // Threshold-Maske: alles über 140 → weiß (255), Rest → schwarz (0)
  const thresholdVal = 140;
  const mask = Buffer.alloc(data.length);
  // Sanfte Version: Kontrast erhöhen aber nicht binarisieren
  const gentle = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i++) {
    const px = data[i];
    if (px >= thresholdVal) {
      // Hintergrund/Rand → rein weiß
      gentle[i] = 255;
      mask[i] = 255;
    } else {
      // Textbereich → sanft kontrastverstärkt (nicht binär schwarz)
      // Kontrast-Stretch: 0..thresholdVal → 0..220 (nicht ganz schwarz, natürlicher)
      gentle[i] = Math.round((px / thresholdVal) * 200);
      mask[i] = 0;
    }
  }

  const buffer = await sharp(gentle, { raw: { width: info.width, height: info.height, channels: 1 } })
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 92 })
    .toBuffer();

  return buffer;
}

/**
 * Verarbeitet eine Quittung in-place (überschreibt die Datei).
 * Gibt den Pfad zurück oder null bei Fehler.
 */
async function processReceiptFile(filePath) {
  try {
    const buffer = await processReceiptImage(filePath);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[receipt] Bildverarbeitung fehlgeschlagen:', err.message);
    return null;
  }
}

module.exports = { processReceiptImage, processReceiptFile };
