// Ermittelt den Anthropic-API-Key für KI-Funktionen (OCR, Bank-Sync-
// Vorschläge). Gemeinsam genutzt von routes/ocr.js und routes/bankSync.js.
const {
  Household,
  HouseholdMember,
  GlobalSettings,
  User,
} = require("../models");

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

module.exports = { resolveApiKey };
