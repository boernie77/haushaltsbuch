const router = require("express").Router();
const { randomUUID } = require("crypto");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const {
  sequelize,
  PaperlessConfig,
  PaperlessDocumentType,
  PaperlessCorrespondent,
  PaperlessTag,
  PaperlessUser,
  HouseholdMember,
  Transaction,
} = require("../models");
const { auth } = require("../middleware/auth");

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

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
async function fetchAllPages(baseUrl, headers) {
  const results = [];
  let nextUrl = baseUrl;
  let configuredOrigin;
  try {
    configuredOrigin = new URL(baseUrl).origin;
  } catch {}
  while (nextUrl) {
    const { data } = await axios.get(nextUrl, { headers, timeout: 30_000 });
    results.push(...(data.results || []));
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
router.get("/config/:householdId", auth, async (req, res) => {
  try {
    if (!(await checkAccess(req.user.id, req.params.householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const config = await PaperlessConfig.findOne({
      where: { householdId: req.params.householdId },
      attributes: ["id", "householdId", "baseUrl", "isActive", "createdAt"],
    });
    res.json({ config });
  } catch {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

// POST /api/paperless/config
router.post("/config", auth, async (req, res) => {
  try {
    const { householdId, baseUrl, apiToken, isActive } = req.body;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Nur testen wenn ein Token mitgegeben wurde
    if (apiToken) {
      try {
        await axios.get(
          `${baseUrl.replace(/\/$/, "")}/api/document_types/?page_size=1`,
          {
            headers: { Authorization: `Token ${apiToken}` },
            timeout: 10_000,
          }
        );
      } catch (e) {
        const msg =
          e.code === "ECONNABORTED"
            ? "Verbindung zu Paperless hat zu lange gedauert (Timeout)."
            : e.response?.status === 401
              ? "Ungültiger API Token."
              : e.response?.status === 403
                ? "API Token hat keine Berechtigung."
                : "Paperless nicht erreichbar. URL und Token prüfen.";
        return res.status(400).json({ error: msg });
      }
    }

    // Vorhandene Config laden — apiToken nur überschreiben wenn neu angegeben
    const existing = await PaperlessConfig.findOne({ where: { householdId } });
    const updateData = {
      householdId,
      baseUrl: baseUrl.replace(/\/$/, ""),
      isActive: isActive === undefined ? true : isActive,
    };
    if (apiToken) {
      updateData.apiToken = apiToken;
    } else if (!existing) {
      return res.status(400).json({ error: "Bitte API Token eingeben" });
    }

    const [config] = await PaperlessConfig.upsert(updateData);
    res.json({
      config: {
        id: config.id,
        householdId,
        baseUrl: updateData.baseUrl,
        isActive: updateData.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to save config: " + err.message });
  }
});

// POST /api/paperless/sync/:householdId
router.post("/sync/:householdId", auth, async (req, res) => {
  try {
    const { householdId } = req.params;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const client = await getPaperlessClient(householdId);
    const now = new Date();

    const [docTypes, correspondents, tags] = await Promise.all([
      fetchAllPages(`${client.baseURL}/api/document_types/`, client.headers),
      fetchAllPages(`${client.baseURL}/api/correspondents/`, client.headers),
      fetchAllPages(`${client.baseURL}/api/tags/`, client.headers),
    ]);

    // Users: optional — erfordert Admin-Rechte in Paperless, Fehler ignorieren
    let users = [];
    try {
      users = await fetchAllPages(
        `${client.baseURL}/api/users/`,
        client.headers
      );
    } catch {
      console.log(
        "[paperless] /api/users/ nicht zugänglich (kein Admin-Token) — Benutzer übersprungen"
      );
    }

    // Bulk-Upsert via raw SQL (ON CONFLICT) — viel schneller als N einzelne Queries
    const bulkUpsert = async (table, rows, conflictCols, updateCols) => {
      if (!rows.length) {
        return;
      }
      const colNames = Object.keys(rows[0]);
      const placeholders = rows
        .map(
          (_, ri) =>
            `(${colNames.map((_, ci) => `$${ri * colNames.length + ci + 1}`).join(",")})`
        )
        .join(",");
      const values = rows.flatMap((r) => colNames.map((c) => r[c]));
      const conflict = conflictCols.map((c) => `"${c}"`).join(",");
      const updates = updateCols
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(",");
      await sequelize.query(
        `INSERT INTO ${table} (${colNames.map((c) => `"${c}"`).join(",")})
         VALUES ${placeholders}
         ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`,
        { bind: values }
      );
    };

    const nowIso = now.toISOString();
    if (docTypes.length) {
      await bulkUpsert(
        "paperless_document_types",
        docTypes.map((dt) => ({
          id: randomUUID(),
          householdId,
          paperlessId: dt.id,
          name: dt.name,
          syncedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
        ["householdId", "paperlessId"],
        ["name", "syncedAt", "updatedAt"]
      );
    }

    if (correspondents.length) {
      await bulkUpsert(
        "paperless_correspondents",
        correspondents.map((c) => ({
          id: randomUUID(),
          householdId,
          paperlessId: c.id,
          name: c.name,
          syncedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
        ["householdId", "paperlessId"],
        ["name", "syncedAt", "updatedAt"]
      );
    }

    if (tags.length) {
      await bulkUpsert(
        "paperless_tags",
        tags.map((t) => ({
          id: randomUUID(),
          householdId,
          paperlessId: t.id,
          name: t.name,
          color: t.colour || null,
          syncedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
        ["householdId", "paperlessId"],
        ["name", "color", "syncedAt", "updatedAt"]
      );
    }

    if (users.length) {
      await bulkUpsert(
        "paperless_users",
        users.map((u) => ({
          id: randomUUID(),
          householdId,
          paperlessId: u.id,
          username: u.username,
          fullName:
            `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
          syncedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
        ["householdId", "paperlessId"],
        ["username", "fullName", "syncedAt", "updatedAt"]
      );
    }

    // In Paperless gelöschte Einträge auch lokal entfernen
    const { Op } = require("sequelize");
    await Promise.all([
      PaperlessDocumentType.destroy({
        where: {
          householdId,
          paperlessId: { [Op.notIn]: docTypes.map((d) => d.id) },
        },
      }),
      PaperlessCorrespondent.destroy({
        where: {
          householdId,
          paperlessId: { [Op.notIn]: correspondents.map((c) => c.id) },
        },
      }),
      PaperlessTag.destroy({
        where: {
          householdId,
          paperlessId: { [Op.notIn]: tags.map((t) => t.id) },
        },
      }),
      ...(users.length
        ? [
            PaperlessUser.destroy({
              where: {
                householdId,
                paperlessId: { [Op.notIn]: users.map((u) => u.id) },
              },
            }),
          ]
        : []),
    ]);

    res.json({
      synced: {
        documentTypes: docTypes.length,
        correspondents: correspondents.length,
        tags: tags.length,
        users: users.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Sync failed: " + err.message });
  }
});

// GET /api/paperless/data/:householdId
router.get("/data/:householdId", auth, async (req, res) => {
  try {
    const { householdId } = req.params;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const [documentTypes, correspondents, tags, users] = await Promise.all([
      PaperlessDocumentType.findAll({
        where: { householdId },
        order: [["name", "ASC"]],
      }),
      PaperlessCorrespondent.findAll({
        where: { householdId },
        order: [["name", "ASC"]],
      }),
      PaperlessTag.findAll({
        where: { householdId },
        order: [["name", "ASC"]],
      }),
      PaperlessUser.findAll({
        where: { householdId },
        order: [["fullName", "ASC"]],
      }),
    ]);
    res.json({ documentTypes, correspondents, tags, users });
  } catch {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// PUT /api/paperless/favorite — toggle isFavorite (doctype/correspondent/tag) oder isEnabled (user)
router.put("/favorite", auth, async (req, res) => {
  try {
    const { type, id, isFavorite, isEnabled } = req.body;
    if (type === "user") {
      const item = await PaperlessUser.findByPk(id);
      if (!item) {
        return res.status(404).json({ error: "Not found" });
      }
      if (!(await checkAccess(req.user.id, item.householdId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      await item.update({ isEnabled });
      return res.json({ id, isEnabled });
    }
    const Model =
      type === "doctype"
        ? PaperlessDocumentType
        : type === "correspondent"
          ? PaperlessCorrespondent
          : PaperlessTag;
    const item = await Model.findByPk(id);
    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!(await checkAccess(req.user.id, item.householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    await item.update({ isFavorite });
    res.json({ id, isFavorite });
  } catch {
    res.status(500).json({ error: "Failed to update" });
  }
});

// GET /api/paperless/check — prüft ob Name in lokaler DB existiert
router.get("/check", auth, async (req, res) => {
  try {
    const { householdId, type, name } = req.query;
    if (!(householdId && type && name)) {
      return res.json({ exists: false });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const { Op } = require("sequelize");
    const Model =
      type === "doctype"
        ? PaperlessDocumentType
        : type === "correspondent"
          ? PaperlessCorrespondent
          : PaperlessTag;
    const item = await Model.findOne({
      where: { householdId, name: { [Op.iLike]: name.trim() } },
    });
    res.json({ exists: !!item, item: item || null });
  } catch {
    res.json({ exists: false });
  }
});

// Hilfsfunktion: findOrCreate in lokaler DB (verhindert Unique-Constraint-Fehler)
const findOrCreateLocal = async (Model, householdId, paperlessId, fields) => {
  const ex = await Model.findOne({ where: { householdId, paperlessId } });
  if (ex) {
    await ex.update({ ...fields, syncedAt: new Date() });
    return ex;
  }
  return Model.create({
    householdId,
    paperlessId,
    ...fields,
    syncedAt: new Date(),
  });
};

// POST /api/paperless/create-type — prüft auf Duplikate
router.post("/create-type", auth, async (req, res) => {
  try {
    const { householdId, name } = req.body;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const client = await getPaperlessClient(householdId);

    const existing = await axios.get(
      `${client.baseURL}/api/document_types/?name=${encodeURIComponent(name)}`,
      { headers: client.headers, timeout: 15_000 }
    );
    const exactMatch = existing.data.results?.find(
      (r) => r.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (exactMatch) {
      const docType = await findOrCreateLocal(
        PaperlessDocumentType,
        householdId,
        exactMatch.id,
        { name: exactMatch.name }
      );
      return res.status(200).json({ documentType: docType, existing: true });
    }

    const response = await axios.post(
      `${client.baseURL}/api/document_types/`,
      { name },
      { headers: client.headers, timeout: 15_000 }
    );
    const docType = await findOrCreateLocal(
      PaperlessDocumentType,
      householdId,
      response.data.id,
      { name }
    );
    res.status(201).json({ documentType: docType });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to create document type: " + err.message });
  }
});

// POST /api/paperless/create-correspondent — prüft auf Duplikate
router.post("/create-correspondent", auth, async (req, res) => {
  try {
    const { householdId, name } = req.body;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const client = await getPaperlessClient(householdId);

    const existing = await axios.get(
      `${client.baseURL}/api/correspondents/?name=${encodeURIComponent(name)}`,
      { headers: client.headers, timeout: 15_000 }
    );
    const exactMatch = existing.data.results?.find(
      (r) => r.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (exactMatch) {
      const correspondent = await findOrCreateLocal(
        PaperlessCorrespondent,
        householdId,
        exactMatch.id,
        { name: exactMatch.name }
      );
      return res.status(200).json({ correspondent, existing: true });
    }

    const response = await axios.post(
      `${client.baseURL}/api/correspondents/`,
      { name },
      { headers: client.headers, timeout: 15_000 }
    );
    const correspondent = await findOrCreateLocal(
      PaperlessCorrespondent,
      householdId,
      response.data.id,
      { name }
    );
    res.status(201).json({ correspondent });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to create correspondent: " + err.message });
  }
});

// POST /api/paperless/create-tag — prüft auf Duplikate
router.post("/create-tag", auth, async (req, res) => {
  try {
    const { householdId, name, color } = req.body;
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const client = await getPaperlessClient(householdId);

    const existing = await axios.get(
      `${client.baseURL}/api/tags/?name=${encodeURIComponent(name)}`,
      { headers: client.headers, timeout: 15_000 }
    );
    const exactMatch = existing.data.results?.find(
      (r) => r.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (exactMatch) {
      const tag = await findOrCreateLocal(
        PaperlessTag,
        householdId,
        exactMatch.id,
        { name: exactMatch.name, color: exactMatch.colour }
      );
      return res.status(200).json({ tag, existing: true });
    }

    const response = await axios.post(
      `${client.baseURL}/api/tags/`,
      { name, colour: color },
      { headers: client.headers, timeout: 15_000 }
    );
    const tag = await findOrCreateLocal(
      PaperlessTag,
      householdId,
      response.data.id,
      { name, color }
    );
    res.status(201).json({ tag });
  } catch (err) {
    res.status(500).json({ error: "Failed to create tag: " + err.message });
  }
});

// GET /api/paperless/users/:householdId — Benutzer aus lokaler DB (nach Sync)
router.get("/users/:householdId", auth, async (req, res) => {
  try {
    if (!(await checkAccess(req.user.id, req.params.householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const users = await PaperlessUser.findAll({
      where: { householdId: req.params.householdId },
      order: [["fullName", "ASC"]],
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users: " + err.message });
  }
});

// POST /api/paperless/upload
router.post("/upload", auth, async (req, res) => {
  try {
    const {
      transactionId,
      documentTypeId,
      correspondentId,
      tagIds,
      title,
      ownerPaperlessUserId,
      viewPaperlessUserIds,
    } = req.body;
    const transaction = await Transaction.findByPk(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (!(await checkAccess(req.user.id, transaction.householdId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!transaction.receiptImage) {
      return res.status(400).json({ error: "No receipt image" });
    }

    const client = await getPaperlessClient(transaction.householdId);

    const [docType, correspondent, tags] = await Promise.all([
      documentTypeId ? PaperlessDocumentType.findByPk(documentTypeId) : null,
      correspondentId ? PaperlessCorrespondent.findByPk(correspondentId) : null,
      tagIds?.length
        ? PaperlessTag.findAll({ where: { id: JSON.parse(tagIds) } })
        : [],
    ]);

    const form = new FormData();
    const imagePath = path.join(
      __dirname,
      "../../",
      transaction.receiptImage
    );
    form.append("document", fs.createReadStream(imagePath));
    if (title) {
      form.append("title", title);
    }
    if (docType?.paperlessId) {
      form.append("document_type", docType.paperlessId);
    }
    if (correspondent?.paperlessId) {
      form.append("correspondent", correspondent.paperlessId);
    }
    tags.forEach((t) => {
      if (t.paperlessId) {
        form.append("tags", t.paperlessId);
      }
    });
    if (ownerPaperlessUserId) {
      form.append("owner", ownerPaperlessUserId);
    }

    const response = await axios.post(
      `${client.baseURL}/api/documents/post_document/`,
      form,
      {
        headers: {
          Authorization: client.headers.Authorization,
          ...form.getHeaders(),
        },
        timeout: 30_000,
      }
    );

    const taskId = response.data;

    // Paperless-Auswahl auf der Transaktion speichern (für Vorauswahl beim nächsten Öffnen)
    await transaction.update({
      paperlessMetadata: JSON.stringify({
        documentTypeId,
        correspondentId,
        tagIds,
        ownerPaperlessUserId,
        viewPaperlessUserIds,
      }),
    });

    // Sofort antworten — paperlessDocId wird im Hintergrund gesetzt wenn Paperless fertig indexiert hat
    res.json({ taskId, message: "Uploaded to Paperless" });

    // Hintergrund: auf Indexierung warten und Berechtigungen setzen
    (async () => {
      let paperlessDocId = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const taskRes = await axios.get(
            `${client.baseURL}/api/tasks/?task_id=${taskId}`,
            { headers: client.headers }
          );
          const task = taskRes.data?.results?.[0] || taskRes.data?.[0];
          if (task?.status === "SUCCESS" && task?.related_document) {
            paperlessDocId = task.related_document;
            break;
          }
        } catch {}
      }
      if (!paperlessDocId) {
        return;
      }
      await transaction.update({ paperlessDocId }).catch(() => {});
      if (viewPaperlessUserIds) {
        const viewIds = JSON.parse(viewPaperlessUserIds);
        if (viewIds.length > 0) {
          await axios
            .patch(
              `${client.baseURL}/api/documents/${paperlessDocId}/`,
              {
                set_permissions: {
                  view: { users: viewIds, groups: [] },
                  change: { users: [], groups: [] },
                },
              },
              { headers: client.headers }
            )
            .catch(() => {});
        }
      }
    })();
  } catch (err) {
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

module.exports = router;
