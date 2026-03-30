const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Verarbeitet ein Quittungsbild zu einem klaren Schwarz-Weiß-Scan:
 * 1. Graustufen
 * 2. Normalize (automatischer Kontrast)
 * 3. CLAHE (adaptives Histogram – gleicht ungleichmäßige Beleuchtung aus)
 * 4. Schärfen (Text klarer)
 * 5. Threshold (Binarisierung: Hintergrund weiß, Text schwarz)
 */
async function processReceiptImage(inputPath) {
  const buffer = await sharp(inputPath)
    .rotate() // EXIF-Rotation korrigieren
    .greyscale()
    .normalize()
    .clahe({ width: 4, height: 4, maxSlope: 3 })
    .sharpen({ sigma: 1.2 })
    .threshold(140)
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
