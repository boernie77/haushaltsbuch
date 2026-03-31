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
    .resize({ width: 1800, withoutEnlargement: true }) // Max 1800px breit → unter 5MB
    .greyscale()
    .normalize() // Voller Dynamikumfang (0-255)
    .clahe({ width: 4, height: 4, maxSlope: 3 }) // Adaptive Kontrastverbesserung
    .sharpen({ sigma: 1.2 }) // Text kräftiger machen VOR Threshold
    .threshold(140) // Originalwert — bewährt für saubere Schwarz-Weiß-Ergebnisse
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
