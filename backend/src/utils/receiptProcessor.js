const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Verarbeitet ein Quittungsbild zu einem klaren Dokumenten-Scan:
 * - Rand/Hintergrund: sauber weiß (CLAHE+Threshold als Maske)
 * - Textbereich: glatte Graustufen aus normalisiertem Bild (kein CLAHE-Rauschen)
 */
async function processReceiptImage(inputPath) {
  // Gemeinsame Basis: rotiert + skaliert + Graustufen
  const baseBuffer = await sharp(inputPath)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .greyscale()
    .normalize()
    .png()
    .toBuffer();

  // 1) Glattes Bild (für Textbereiche): nur normalize, KEIN CLAHE → keine Artefakte
  const { data: smooth, info } = await sharp(baseBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2) Threshold-Maske (für Hintergrund-Erkennung): CLAHE+Sharpen+Threshold
  const { data: mask } = await sharp(baseBuffer)
    .clahe({ width: 4, height: 4, maxSlope: 3 })
    .sharpen({ sigma: 1.2 })
    .threshold(140)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Kombinieren: Maske weiß → weiß (Hintergrund), Maske schwarz → glatter Wert (Text)
  const result = Buffer.alloc(smooth.length);
  for (let i = 0; i < smooth.length; i++) {
    if (mask[i] === 255) {
      result[i] = 255; // Hintergrund/Rand → rein weiß
    } else {
      result[i] = smooth[i]; // Text → glatte Graustufen
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
