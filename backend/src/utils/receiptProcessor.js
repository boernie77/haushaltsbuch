const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Verarbeitet ein Quittungsbild zu einem klaren Dokumenten-Scan:
 * - Rand/Hintergrund: sauber weiß (wie Threshold)
 * - Textbereich: behält Graustufen für bessere Lesbarkeit
 */
async function processReceiptImage(inputPath) {
  // Vorverarbeitung: Graustufen, Kontrast, CLAHE, Schärfen
  const { data, info } = await sharp(inputPath)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .greyscale()
    .normalize()
    .clahe({ width: 4, height: 4, maxSlope: 3 })
    .sharpen({ sigma: 1.2 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Pixel-Mapping: Hintergrund → weiß, Text → Graustufen behalten
  const result = Buffer.alloc(data.length);
  const cutoff = 140; // Ab hier = Hintergrund (wie bewährter Threshold)

  for (let i = 0; i < data.length; i++) {
    const px = data[i];
    if (px >= cutoff) {
      // Hintergrund/Rand → rein weiß
      result[i] = 255;
    } else {
      // Text → originalen CLAHE-Wert behalten (Graustufen, nicht binär schwarz)
      result[i] = px;
    }
  }

  const buffer = await sharp(result, {
    raw: { width: info.width, height: info.height, channels: 1 }
  })
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
