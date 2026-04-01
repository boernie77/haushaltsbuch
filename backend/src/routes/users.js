const router = require("express").Router();
const { User } = require("../models");
const { auth } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// PUT /api/users/avatar
router.post("/avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file" });
    }

    const filename = `avatar_${req.user.id}.jpg`;
    const filepath = path.join(__dirname, "../../uploads", filename);

    await sharp(req.file.buffer)
      .resize(200, 200, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toFile(filepath);

    await req.user.update({ avatar: `/uploads/${filename}` });
    res.json({ avatar: `/uploads/${filename}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

module.exports = router;
