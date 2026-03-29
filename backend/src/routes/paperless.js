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

// GET /api/paperless/config/:householdId
router.get('/config/:householdId', auth, async (req, res) => {
  try {
    if (!await checkAccess(req.user.id, req.params.householdId)) return res.status(403).json({ error: 'Access denied' });

    const config = await PaperlessConfig.findOne({
      where: { householdId: req.params.householdId },
      attributes: ['id', 'householdId', 'baseUrl', 'isActive', 'createdAt']
    });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// POST /api/paperless/config
router.post('/config', auth, async (req, res) => {
  try {
    const { householdId, baseUrl, apiToken } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    // Test connection
    try {
      await axios.get(`${baseUrl.replace(/\/$/, '')}/api/`, {
        headers: { Authorization: `Token ${apiToken}` }
      });
    } catch {
      return res.status(400).json({ error: 'Cannot connect to Paperless. Check URL and token.' });
    }

    const [config] = await PaperlessConfig.upsert({ householdId, baseUrl, apiToken, isActive: true });
    res.json({ config: { id: config.id, householdId, baseUrl, isActive: true } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /api/paperless/sync/:householdId — sync document types, correspondents, tags
router.post('/sync/:householdId', auth, async (req, res) => {
  try {
    const { householdId } = req.params;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const client = await getPaperlessClient(householdId);
    const now = new Date();

    const [docTypes, correspondents, tags] = await Promise.all([
      axios.get(`${client.baseURL}/api/document_types/?page_size=200`, { headers: client.headers }),
      axios.get(`${client.baseURL}/api/correspondents/?page_size=200`, { headers: client.headers }),
      axios.get(`${client.baseURL}/api/tags/?page_size=200`, { headers: client.headers })
    ]);

    // Upsert document types
    for (const dt of docTypes.data.results || []) {
      await PaperlessDocumentType.upsert({
        householdId, paperlessId: dt.id, name: dt.name, syncedAt: now
      });
    }

    // Upsert correspondents
    for (const c of correspondents.data.results || []) {
      await PaperlessCorrespondent.upsert({
        householdId, paperlessId: c.id, name: c.name, syncedAt: now
      });
    }

    // Upsert tags
    for (const t of tags.data.results || []) {
      await PaperlessTag.upsert({
        householdId, paperlessId: t.id, name: t.name, color: t.colour, syncedAt: now
      });
    }

    res.json({
      synced: {
        documentTypes: docTypes.data.results?.length || 0,
        correspondents: correspondents.data.results?.length || 0,
        tags: tags.data.results?.length || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// GET /api/paperless/data/:householdId — get all local paperless data
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// POST /api/paperless/create-type — create document type in Paperless + local
router.post('/create-type', auth, async (req, res) => {
  try {
    const { householdId, name } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const client = await getPaperlessClient(householdId);
    const response = await axios.post(`${client.baseURL}/api/document_types/`, { name }, { headers: client.headers });
    const docType = await PaperlessDocumentType.create({
      householdId, paperlessId: response.data.id, name, syncedAt: new Date()
    });
    res.status(201).json({ documentType: docType });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create document type' });
  }
});

// POST /api/paperless/create-correspondent
router.post('/create-correspondent', auth, async (req, res) => {
  try {
    const { householdId, name } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const client = await getPaperlessClient(householdId);
    const response = await axios.post(`${client.baseURL}/api/correspondents/`, { name }, { headers: client.headers });
    const correspondent = await PaperlessCorrespondent.create({
      householdId, paperlessId: response.data.id, name, syncedAt: new Date()
    });
    res.status(201).json({ correspondent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create correspondent' });
  }
});

// POST /api/paperless/create-tag
router.post('/create-tag', auth, async (req, res) => {
  try {
    const { householdId, name, color } = req.body;
    if (!await checkAccess(req.user.id, householdId)) return res.status(403).json({ error: 'Access denied' });

    const client = await getPaperlessClient(householdId);
    const response = await axios.post(`${client.baseURL}/api/tags/`, { name, colour: color }, { headers: client.headers });
    const tag = await PaperlessTag.create({
      householdId, paperlessId: response.data.id, name, color, syncedAt: new Date()
    });
    res.status(201).json({ tag });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// POST /api/paperless/upload — upload receipt to Paperless
router.post('/upload', auth, async (req, res) => {
  try {
    const { transactionId, documentTypeId, correspondentId, tagIds, title } = req.body;
    const transaction = await Transaction.findByPk(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (!await checkAccess(req.user.id, transaction.householdId)) return res.status(403).json({ error: 'Access denied' });
    if (!transaction.receiptImage) return res.status(400).json({ error: 'No receipt image' });

    const client = await getPaperlessClient(transaction.householdId);

    // Resolve Paperless IDs
    const [docType, correspondent, tags] = await Promise.all([
      documentTypeId ? PaperlessDocumentType.findByPk(documentTypeId) : null,
      correspondentId ? PaperlessCorrespondent.findByPk(correspondentId) : null,
      tagIds ? PaperlessTag.findAll({ where: { id: JSON.parse(tagIds) } }) : []
    ]);

    const form = new FormData();
    const imagePath = path.join(__dirname, '../../', transaction.receiptImage);
    form.append('document', fs.createReadStream(imagePath));
    if (title) form.append('title', title);
    if (docType?.paperlessId) form.append('document_type', docType.paperlessId);
    if (correspondent?.paperlessId) form.append('correspondent', correspondent.paperlessId);
    tags.forEach(t => { if (t.paperlessId) form.append('tags', t.paperlessId); });

    const response = await axios.post(`${client.baseURL}/api/documents/post_document/`, form, {
      headers: { ...client.headers, ...form.getHeaders(), 'Content-Type': undefined }
    });

    await transaction.update({ paperlessDocId: response.data });
    res.json({ paperlessDocId: response.data, message: 'Uploaded to Paperless' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

module.exports = router;
