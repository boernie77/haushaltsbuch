const router = require('express').Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { PaperlessConfig, PaperlessDocumentType, PaperlessCorrespondent, PaperlessTag, HouseholdMember, Transaction } = require('../models');
const { auth } = require('../middleware/auth');

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

async function getPaperlessClient(householdId) {
  const config = await PaperlessConfig.findOne({ where: { householdId, isActive: true } });
  if (!config) throw new Error('Paperless not configured');
  return {
    baseURL: config.baseUrl.replace(/\/$/, ''),
    headers: { Authorization: `Token ${config.apiToken}`, 'Content-Type': 'application/json' }
  };
}

// Holt alle Seiten einer paginierten Paperless-API-Ressource
async function fetchAllPages(url, headers) {
  const results = [];
  let nextUrl = url;
  while (nextUrl) {
    const { data } = await axios.get(nextUrl, { headers });
    results.push(...(data.results || []));
    nextUrl = data.next || null;
  }
  return results;
}

// GET /api/paperless/config/:householdId
router.get('/config/:householdId', auth, async (req, res) => {
  try {
    if (!await checkAccess(req.user.id, req.params.householdId)) return res.status(403).json({ error: 'Access denied' });
    const config = await PaperlessConfig.findOne({
      where: { householdId: req.params.householdId },
      attributes: ['id', 'householdId', 'baseUrl', 'isActive', 'createdAt']
    });
    res.json({ config });
  } catch {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// POST /api/paperless/config
router.post('/config', auth, async (req, res) => {
  try {
    const { householdId, baseUrl, apiToken } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });
    try {
      await axios.get(`${baseUrl.replace(/\/$/, '')}/api/`, { headers: { Authorization: `Token ${apiToken}` } });
    } catch {
      return res.status(400).json({ error: 'Cannot connect to Paperless. Check URL and token.' });
    }
    const [config] = await PaperlessConfig.upsert({ householdId, baseUrl, apiToken, isActive: true });
    res.json({ config: { id: config.id, householdId, baseUrl, isActive: true } });
  } catch {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /api/paperless/sync/:householdId
router.post('/sync/:householdId', auth, async (req, res) => {
  try {
    const { householdId } = req.params;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });
    const client = await getPaperlessClient(householdId);
    const now = new Date();

    const [docTypes, correspondents, tags] = await Promise.all([
      fetchAllPages(`${client.baseURL}/api/document_types/`, client.headers),
      fetchAllPages(`${client.baseURL}/api/correspondents/`, client.headers),
      fetchAllPages(`${client.baseURL}/api/tags/`, client.headers),
    ]);

    for (const dt of docTypes) {
      await PaperlessDocumentType.upsert({ householdId, paperlessId: dt.id, name: dt.name, syncedAt: now });
    }
    for (const c of correspondents) {
      await PaperlessCorrespondent.upsert({ householdId, paperlessId: c.id, name: c.name, syncedAt: now });
    }
    for (const t of tags) {
      await PaperlessTag.upsert({ householdId, paperlessId: t.id, name: t.name, color: t.colour, syncedAt: now });
    }

    res.json({
      synced: {
        documentTypes: docTypes.length,
        correspondents: correspondents.length,
        tags: tags.length,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// GET /api/paperless/data/:householdId
router.get('/data/:householdId', auth, async (req, res) => {
  try {
    const { householdId } = req.params;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });
    const [documentTypes, correspondents, tags] = await Promise.all([
      PaperlessDocumentType.findAll({ where: { householdId }, order: [['name', 'ASC']] }),
      PaperlessCorrespondent.findAll({ where: { householdId }, order: [['name', 'ASC']] }),
      PaperlessTag.findAll({ where: { householdId }, order: [['name', 'ASC']] })
    ]);
    res.json({ documentTypes, correspondents, tags });
  } catch {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// PUT /api/paperless/favorite — toggle isFavorite
router.put('/favorite', auth, async (req, res) => {
  try {
    const { type, id, isFavorite } = req.body;
    // type: 'doctype' | 'correspondent' | 'tag'
    const Model = type === 'doctype' ? PaperlessDocumentType
                : type === 'correspondent' ? PaperlessCorrespondent
                : PaperlessTag;
    const item = await Model.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!await checkAccess(req.user.id, item.householdId)) return res.status(403).json({ error: 'Access denied' });
    await item.update({ isFavorite });
    res.json({ id, isFavorite });
  } catch {
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

// POST /api/paperless/create-type — prüft auf Duplikate
router.post('/create-type', auth, async (req, res) => {
  try {
    const { householdId, name } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });
    const client = await getPaperlessClient(householdId);

    // Auf Duplikat in Paperless prüfen
    const existing = await axios.get(`${client.baseURL}/api/document_types/?name=${encodeURIComponent(name)}`, { headers: client.headers });
    if (existing.data.results?.length > 0) {
      const found = existing.data.results[0];
      const [docType] = await PaperlessDocumentType.upsert({ householdId, paperlessId: found.id, name: found.name, syncedAt: new Date() });
      return res.status(200).json({ documentType: docType, existing: true });
    }

    const response = await axios.post(`${client.baseURL}/api/document_types/`, { name }, { headers: client.headers });
    const docType = await PaperlessDocumentType.create({ householdId, paperlessId: response.data.id, name, syncedAt: new Date() });
    res.status(201).json({ documentType: docType });
  } catch {
    res.status(500).json({ error: 'Failed to create document type' });
  }
});

// POST /api/paperless/create-correspondent — prüft auf Duplikate
router.post('/create-correspondent', auth, async (req, res) => {
  try {
    const { householdId, name } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });
    const client = await getPaperlessClient(householdId);

    const existing = await axios.get(`${client.baseURL}/api/correspondents/?name=${encodeURIComponent(name)}`, { headers: client.headers });
    if (existing.data.results?.length > 0) {
      const found = existing.data.results[0];
      const [correspondent] = await PaperlessCorrespondent.upsert({ householdId, paperlessId: found.id, name: found.name, syncedAt: new Date() });
      return res.status(200).json({ correspondent, existing: true });
    }

    const response = await axios.post(`${client.baseURL}/api/correspondents/`, { name }, { headers: client.headers });
    const correspondent = await PaperlessCorrespondent.create({ householdId, paperlessId: response.data.id, name, syncedAt: new Date() });
    res.status(201).json({ correspondent });
  } catch {
    res.status(500).json({ error: 'Failed to create correspondent' });
  }
});

// POST /api/paperless/create-tag — prüft auf Duplikate
router.post('/create-tag', auth, async (req, res) => {
  try {
    const { householdId, name, color } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });
    const client = await getPaperlessClient(householdId);

    const existing = await axios.get(`${client.baseURL}/api/tags/?name=${encodeURIComponent(name)}`, { headers: client.headers });
    if (existing.data.results?.length > 0) {
      const found = existing.data.results[0];
      const [tag] = await PaperlessTag.upsert({ householdId, paperlessId: found.id, name: found.name, color: found.colour, syncedAt: new Date() });
      return res.status(200).json({ tag, existing: true });
    }

    const response = await axios.post(`${client.baseURL}/api/tags/`, { name, colour: color }, { headers: client.headers });
    const tag = await PaperlessTag.create({ householdId, paperlessId: response.data.id, name, color, syncedAt: new Date() });
    res.status(201).json({ tag });
  } catch {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// GET /api/paperless/users/:householdId — Benutzer aus Paperless laden
router.get('/users/:householdId', auth, async (req, res) => {
  try {
    if (!await checkAccess(req.user.id, req.params.householdId)) return res.status(403).json({ error: 'Access denied' });
    const client = await getPaperlessClient(req.params.householdId);
    const users = await fetchAllPages(`${client.baseURL}/api/users/`, client.headers);
    res.json({ users: users.map(u => ({ id: u.id, username: u.username, fullName: `${u.first_name} ${u.last_name}`.trim() || u.username })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Paperless users: ' + err.message });
  }
});

// POST /api/paperless/upload
router.post('/upload', auth, async (req, res) => {
  try {
    const { transactionId, documentTypeId, correspondentId, tagIds, title, ownerPaperlessUserId, viewPaperlessUserIds } = req.body;
    const transaction = await Transaction.findByPk(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (!await checkAccess(req.user.id, transaction.householdId)) return res.status(403).json({ error: 'Access denied' });
    if (!transaction.receiptImage) return res.status(400).json({ error: 'No receipt image' });

    const client = await getPaperlessClient(transaction.householdId);

    const [docType, correspondent, tags] = await Promise.all([
      documentTypeId ? PaperlessDocumentType.findByPk(documentTypeId) : null,
      correspondentId ? PaperlessCorrespondent.findByPk(correspondentId) : null,
      tagIds?.length ? PaperlessTag.findAll({ where: { id: JSON.parse(tagIds) } }) : []
    ]);

    const form = new FormData();
    const imagePath = path.join(__dirname, '../../', transaction.receiptImage);
    form.append('document', fs.createReadStream(imagePath));
    if (title) form.append('title', title);
    if (docType?.paperlessId) form.append('document_type', docType.paperlessId);
    if (correspondent?.paperlessId) form.append('correspondent', correspondent.paperlessId);
    tags.forEach(t => { if (t.paperlessId) form.append('tags', t.paperlessId); });
    if (ownerPaperlessUserId) form.append('owner', ownerPaperlessUserId);

    const response = await axios.post(`${client.baseURL}/api/documents/post_document/`, form, {
      headers: { Authorization: client.headers.Authorization, ...form.getHeaders() }
    });

    // Dokument-ID aus Task-Response — Paperless gibt Task-UUID zurück, nicht direkt die Doc-ID
    // Wir speichern die Task-UUID vorerst und versuchen nach kurzer Wartezeit die Doc-ID zu holen
    const taskId = response.data;
    let paperlessDocId = null;

    // Bis zu 10s warten bis das Dokument indexiert ist
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const taskRes = await axios.get(`${client.baseURL}/api/tasks/?task_id=${taskId}`, { headers: client.headers });
        const task = taskRes.data?.results?.[0] || taskRes.data?.[0];
        if (task?.status === 'SUCCESS' && task?.related_document) {
          paperlessDocId = task.related_document;
          break;
        }
      } catch {}
    }

    // Berechtigungen setzen falls Benutzer ausgewählt
    if (paperlessDocId && viewPaperlessUserIds) {
      const viewIds = JSON.parse(viewPaperlessUserIds);
      if (viewIds.length > 0) {
        try {
          await axios.patch(`${client.baseURL}/api/documents/${paperlessDocId}/`,
            { set_permissions: { view: { users: viewIds, groups: [] }, change: { users: [], groups: [] } } },
            { headers: client.headers }
          );
        } catch {}
      }
    }

    await transaction.update({ paperlessDocId: paperlessDocId || taskId });
    res.json({ paperlessDocId: paperlessDocId || taskId, message: 'Uploaded to Paperless' });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

module.exports = router;
