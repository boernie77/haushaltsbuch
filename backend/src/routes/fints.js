// Bank-Sync per FinTS/HBCI: Umsätze direkt von der Bank abrufen. Die eigentliche
// Bankkommunikation macht der Python-Sidecar (fints-service, python-fints);
// dieses Backend verwaltet Zugangsdaten (PIN verschlüsselt, optional) und
// leitet das Ergebnis durch dieselbe Vorschau wie der Datei-Import.
const router = require("express").Router();
const { Account, BankImport, FintsConnection } = require("../models");
const { auth } = require("../middleware/auth");
const bankSync = require("./bankSync");

const SERVICE_URL = process.env.FINTS_SERVICE_URL || "http://fints:8000";
// Bank-Dialoge mit Push-TAN können Minuten dauern.
const SERVICE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 90;
const OVERLAP_DAYS = 7;
const DAY_MS = 86_400_000;
const PENDING_TTL_MS = 10 * 60 * 1000;

// Laufende TAN-Dialoge: Sitzungs-ID (aus dem Sidecar) → wer sie gestartet hat.
const pendingSessions = new Map();

function rememberSession(sid, info) {
  const now = Date.now();
  for (const [key, value] of pendingSessions) {
    if (now - value.created > PENDING_TTL_MS) {
      pendingSessions.delete(key);
    }
  }
  pendingSessions.set(sid, { ...info, created: now });
}

async function callService(path, body) {
  const res = await fetch(`${SERVICE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
  });
  return res.json();
}

const isoDate = (d) => d.toISOString().slice(0, 10);

async function defaultDateRange(accountId) {
  const today = new Date();
  const last = await BankImport.findOne({
    where: { accountId },
    order: [["dateTo", "DESC"]],
  });
  const from = last
    ? new Date(new Date(`${last.dateTo}T00:00:00Z`).getTime() - OVERLAP_DAYS * DAY_MS)
    : new Date(today.getTime() - DEFAULT_LOOKBACK_DAYS * DAY_MS);
  return { dateFrom: isoDate(from), dateTo: isoDate(today) };
}

// Prüft Zugriff und lädt Konto + Zugang. Schreibt bei Fehler die Antwort und
// gibt null zurück.
async function loadContext(req, res, { needConnection = true } = {}) {
  const { householdId, accountId } = { ...req.query, ...req.body };
  if (!(householdId && accountId)) {
    res.status(400).json({ error: "householdId & accountId required" });
    return null;
  }
  if (!(await bankSync.checkWriteAccess(req.user.id, householdId))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  const account = await Account.findOne({ where: { id: accountId, householdId } });
  if (!account) {
    res.status(404).json({ error: "Konto nicht gefunden" });
    return null;
  }
  const connection = await FintsConnection.findOne({ where: { accountId } });
  if (needConnection && !connection) {
    res.status(400).json({ error: "Für dieses Konto ist kein FinTS-Zugang eingerichtet." });
    return null;
  }
  return { householdId, accountId, account, connection };
}

function connectionPayload(connection, pin) {
  return {
    bankCode: connection.bankCode,
    url: connection.fintsUrl,
    login: connection.loginName,
    pin,
    tanMethod: connection.tanMethod || null,
    tanMedium: connection.tanMedium || null,
  };
}

function connectionJson(c) {
  return c
    ? {
        bankCode: c.bankCode,
        fintsUrl: c.fintsUrl,
        loginName: c.loginName,
        hasPin: Boolean(c.pin),
        tanMethod: c.tanMethod,
        tanMedium: c.tanMedium,
      }
    : null;
}

// Verarbeitet die Antwort des Sidecars: bei "ok" die Vorschau bauen, sonst
// TAN-Abfrage bzw. Fehler an den Client weiterreichen.
async function relay(result, ctx, userId, res) {
  if (result.status === "ok") {
    const rows = result.transactions || [];
    const payload = await bankSync.buildPreviewPayload({
      householdId: ctx.householdId,
      accountId: ctx.accountId,
      userId,
      rows,
    });
    const dates = rows.map((r) => r.date).sort();
    return res.json({
      status: "ok",
      format: "fints",
      ...payload,
      range: ctx.range,
      fileDateFrom: ctx.range.dateFrom,
      fileDateTo: ctx.range.dateTo,
      firstDate: dates[0] || null,
      lastDate: dates.at(-1) || null,
    });
  }
  if (result.status === "tan_required") {
    rememberSession(result.session, {
      userId,
      householdId: ctx.householdId,
      accountId: ctx.accountId,
      range: ctx.range,
    });
    return res.json(result);
  }
  if (result.status === "tan_method_needed") {
    return res.json(result);
  }
  const status = result.code === "not_configured" ? 503 : 502;
  return res.status(status).json({ error: result.error || "FinTS-Fehler" });
}

function serviceDown(res, err) {
  console.error("[fints]", err.message);
  return res.status(503).json({
    error: "Der FinTS-Dienst ist nicht erreichbar. Läuft der Container „fints“?",
  });
}

// GET /api/fints/status — ist FinTS auf dieser Installation nutzbar?
router.get("/status", auth, async (_req, res) => {
  try {
    const health = await callService("/health");
    res.json({ available: Boolean(health.configured) });
  } catch {
    res.json({ available: false });
  }
});

router.get("/connection", auth, async (req, res) => {
  try {
    const ctx = await loadContext(req, res, { needConnection: false });
    if (!ctx) {
      return;
    }
    res.json({
      connection: connectionJson(ctx.connection),
      hasIban: Boolean(ctx.account.iban),
    });
  } catch (err) {
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

router.put("/connection", auth, async (req, res) => {
  try {
    const ctx = await loadContext(req, res, { needConnection: false });
    if (!ctx) {
      return;
    }
    const { bankCode, fintsUrl, loginName, pin, savePin, tanMethod, tanMedium } =
      req.body;
    if (!(bankCode && fintsUrl && loginName)) {
      return res
        .status(400)
        .json({ error: "Bankleitzahl, FinTS-Adresse und Zugangsname sind Pflicht." });
    }
    if (!/^https:\/\//i.test(String(fintsUrl).trim())) {
      return res.status(400).json({ error: "Die FinTS-Adresse muss mit https:// beginnen." });
    }
    const values = {
      householdId: ctx.householdId,
      accountId: ctx.accountId,
      userId: req.user.id,
      bankCode: String(bankCode).replace(/\s/g, ""),
      fintsUrl: String(fintsUrl).trim(),
      loginName: String(loginName).trim(),
      tanMethod: tanMethod || null,
      tanMedium: tanMedium || null,
    };
    if (savePin === false) {
      values.pin = null;
    } else if (pin) {
      values.pin = pin;
    }
    const connection = ctx.connection
      ? await ctx.connection.update(values)
      : await FintsConnection.create(values);
    res.json({ connection: connectionJson(connection) });
  } catch (err) {
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

router.delete("/connection", auth, async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) {
      return;
    }
    await ctx.connection.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// Liste der TAN-Verfahren der Bank (für die Auswahl beim Einrichten).
router.post("/tan-methods", auth, async (req, res) => {
  try {
    const ctx = await loadContext(req, res, { needConnection: false });
    if (!ctx) {
      return;
    }
    const { bankCode, fintsUrl, loginName, pin } = req.body;
    const stored = ctx.connection;
    const effectivePin = pin || stored?.pin;
    if (!(bankCode && fintsUrl && loginName && effectivePin)) {
      return res.status(400).json({ error: "Bank-Angaben und PIN sind nötig." });
    }
    const result = await callService("/tan-methods", {
      bankCode,
      url: fintsUrl,
      login: loginName,
      pin: effectivePin,
    });
    if (result.status !== "ok") {
      return res.status(502).json({ error: result.error || "FinTS-Fehler" });
    }
    res.json({ methods: result.methods });
  } catch (err) {
    serviceDown(res, err);
  }
});

router.post("/fetch", auth, async (req, res) => {
  try {
    const ctx = await loadContext(req, res);
    if (!ctx) {
      return;
    }
    if (!ctx.account.iban) {
      return res
        .status(400)
        .json({ error: "Beim Konto fehlt die IBAN (Konten → Bearbeiten)." });
    }
    const pin = req.body.pin || ctx.connection.pin;
    if (!pin) {
      return res.status(400).json({ error: "PIN erforderlich." });
    }
    ctx.range = {
      ...(await defaultDateRange(ctx.accountId)),
      ...(req.body.dateFrom ? { dateFrom: req.body.dateFrom } : {}),
      ...(req.body.dateTo ? { dateTo: req.body.dateTo } : {}),
    };
    const result = await callService("/fetch", {
      ...connectionPayload(ctx.connection, pin),
      iban: ctx.account.iban,
      ...ctx.range,
    });
    await relay(result, ctx, req.user.id, res);
  } catch (err) {
    serviceDown(res, err);
  }
});

router.post("/tan", auth, async (req, res) => {
  try {
    const { session, tan } = req.body;
    const info = pendingSessions.get(session);
    if (!info || info.userId !== req.user.id) {
      return res.status(410).json({ error: "Sitzung abgelaufen. Bitte neu abrufen." });
    }
    const result = await callService("/tan", { session, tan: tan || "" });
    if (result.status !== "tan_required") {
      pendingSessions.delete(session);
    }
    await relay(result, info, req.user.id, res);
  } catch (err) {
    serviceDown(res, err);
  }
});

module.exports = router;
