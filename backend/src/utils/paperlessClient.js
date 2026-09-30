// Gemeinsamer Paperless-ngx-Client (routes/paperless.js, Bank-Sync-Abgleich
// in utils/paperlessMatcher.js).
const axios = require("axios");
const { PaperlessConfig } = require("../models");

async function getPaperlessClient(householdId) {
  const config = await PaperlessConfig.findOne({
    where: { householdId, isActive: true },
  });
  if (!config) {
    throw new Error("Paperless not configured");
  }
  return {
    baseURL: config.baseUrl.replace(/\/$/, ""),
    headers: {
      Authorization: `Token ${config.apiToken}`,
      "Content-Type": "application/json",
    },
  };
}

// Holt alle Seiten einer paginierten Paperless-API-Ressource
// Normalisiert data.next auf den konfigurierten Host (Paperless gibt oft interne URLs zurück)
// maxResults: optionale Obergrenze (bricht nach der Seite ab, die sie erreicht).
async function fetchAllPages(baseUrl, headers, maxResults = Number.POSITIVE_INFINITY) {
  const results = [];
  let nextUrl = baseUrl;
  let configuredOrigin;
  try {
    configuredOrigin = new URL(baseUrl).origin;
  } catch {}
  while (nextUrl) {
    const { data } = await axios.get(nextUrl, { headers, timeout: 30_000 });
    results.push(...(data.results || []));
    if (results.length >= maxResults) {
      break;
    }
    if (data.next && configuredOrigin) {
      try {
        const u = new URL(data.next);
        u.protocol = new URL(baseUrl).protocol;
        u.host = new URL(baseUrl).host;
        nextUrl = u.toString();
      } catch {
        nextUrl = null;
      }
    } else {
      nextUrl = null;
    }
  }
  return results;
}

// GET /api/paperless/config/:householdId

module.exports = { fetchAllPages, getPaperlessClient };
