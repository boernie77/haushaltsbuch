const path = require("path");
const fs = require("fs");

async function migrate(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      name VARCHAR(255) PRIMARY KEY,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const [rows] = await sequelize.query('SELECT name FROM "_migrations"');
  const done = new Set(rows.map((r) => r.name));

  const dir = path.join(__dirname, "../migrations");
  if (!fs.existsSync(dir)) {
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`[migrate] skip: ${file}`);
      continue;
    }
    console.log(`[migrate] run:  ${file}`);
    const { up } = require(path.join(dir, file));
    await up(sequelize);
    await sequelize.query('INSERT INTO "_migrations" (name) VALUES (:name)', {
      replacements: { name: file },
    });
    console.log(`[migrate] done: ${file}`);
  }
  console.log("[migrate] all up to date");
}

module.exports = { migrate };

if (require.main === module) {
  require("dotenv").config({
    path: path.join(__dirname, "../../.env"),
  });
  const { sequelize } = require("../models");
  migrate(sequelize)
    .then(() => {
      console.log("Done");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
