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
    .resize({ width: 2000, withoutEnlargement: true }) // Max 2000px breit → unter 5MB für Claude API
    .greyscale()
    .normalize() // Voller Dynamikumfang (0-255)
    .clahe({ width: 4, height: 4, maxSlope: 3 }) // Adaptive Kontrastverbesserung
    .linear(1.4, -(255 * 0.15)) // Kontrast erhöhen + Hintergrund aufhellen (kein harter Threshold)
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 85 })
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
