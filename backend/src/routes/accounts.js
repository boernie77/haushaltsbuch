// Konten innerhalb eines Haushaltsbuchs (Giro, Kreditkarte, Bargeld, …).
// Saldo wird live aus startingBalance + Buchungen errechnet — keine
// redundante Speicherung, damit Edits/Deletes keine Inkonsistenzen erzeugen.
const router = require("express").Router();
const { Op } = require("sequelize");
const { Account, HouseholdMember, Transaction } = require("../models");
const { auth } = require("../middleware/auth");

async function checkAccess(userId, householdId) {
  return HouseholdMember.findOne({ where: { userId, householdId } });
}

// Saldo eines Kontos: startingBalance
//   + Summe(income wo accountId=X)         [Geld kommt rein]
//   − Summe(expense wo accountId=X)        [Geld geht raus]
//   + Summe(transfer wo target=X)          [Eingang von anderem Konto]
//   − Summe(transfer wo source=X)          [Ausgang zu anderem Konto]
// Bei Liability-Konten dreht sich die Bedeutung: positiver Saldo = Schulden.
// Die Rechnung ist aber identisch — der Typ ist nur fürs Vorzeichen-Display.
async function computeBalance(account) {
  // affectsAccountBalance=false → virtuelle Settlement-Buchungen, die nur
  // in Statistiken auftauchen, aber den Konto-Saldo nicht bewegen.
  const where = {
    householdId: account.householdId,
    affectsAccountBalance: { [Op.ne]: false },
  };
  const [income, expense, transferIn, transferOut] = await Promise.all([
    Transaction.sum("amount", {
      where: { ...where, type: "income", accountId: account.id },
    }),
    Transaction.sum("amount", {
      where: { ...where, type: "expense", accountId: account.id },
    }),
    Transaction.sum("amount", {
      where: {
        ...where,
        type: "transfer",
        transferTargetAccountId: account.id,
      },
    }),
    Transaction.sum("amount", {
      where: { ...where, type: "transfer", accountId: account.id },
    }),
  ]);
  const start = Number.parseFloat(account.startingBalance) || 0;
  const balance =
    start +
    (Number.parseFloat(income) || 0) -
    (Number.parseFloat(expense) || 0) +
    (Number.parseFloat(transferIn) || 0) -
    (Number.parseFloat(transferOut) || 0);
  return Math.round(balance * 100) / 100;
}

// GET /api/accounts?householdId=
router.get("/", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    if (!householdId) {
      return res.status(400).json({ error: "householdId required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const accounts = await Account.findAll({
      where: { householdId },
      order: [
        ["sortOrder", "ASC"],
        ["createdAt", "ASC"],
      ],
    });
    const enriched = await Promise.all(
      accounts.map(async (a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        icon: a.icon,
        color: a.color,
        startingBalance: Number(a.startingBalance),
        isActive: a.isActive,
        sortOrder: a.sortOrder,
        balance: await computeBalance(a),
      }))
    );
    res.json({ accounts: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// POST /api/accounts
router.post("/", auth, async (req, res) => {
  try {
    const { householdId, name, type, icon, color, startingBalance, sortOrder } =
      req.body;
    if (!(householdId && name)) {
      return res.status(400).json({ error: "householdId & name required" });
    }
    if (!(await checkAccess(req.user.id, householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const account = await Account.create({
      householdId,
      name: name.trim(),
      type: type === "liability" ? "liability" : "asset",
      icon: icon || "💳",
      color: color || "#3B82F6",
      startingBalance: Number.parseFloat(startingBalance) || 0,
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
    });
    res.json({
      account: {
        ...account.toJSON(),
        balance: Number(account.startingBalance),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// PUT /api/accounts/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const account = await Account.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    if (!(await checkAccess(req.user.id, account.householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { name, type, icon, color, startingBalance, isActive, sortOrder } =
      req.body;
    await account.update({
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && {
        type: type === "liability" ? "liability" : "asset",
      }),
      ...(icon !== undefined && { icon }),
      ...(color !== undefined && { color }),
      ...(startingBalance !== undefined && {
        startingBalance: Number.parseFloat(startingBalance) || 0,
      }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(sortOrder !== undefined && {
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
      }),
    });
    res.json({
      account: { ...account.toJSON(), balance: await computeBalance(account) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

// DELETE /api/accounts/:id — nur wenn keine Buchungen mehr referenzieren
router.delete("/:id", auth, async (req, res) => {
  try {
    const account = await Account.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    if (!(await checkAccess(req.user.id, account.householdId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const refs = await Transaction.count({
      where: {
        [Op.or]: [
          { accountId: account.id },
          { transferTargetAccountId: account.id },
        ],
      },
    });
    if (refs > 0) {
      return res.status(400).json({
        error: `Konto wird von ${refs} Buchung(en) verwendet. Konto erst deaktivieren oder Buchungen verschieben.`,
      });
    }
    // Mindestens 1 Konto muss übrig bleiben, sonst hat der Haushalt keine
    // Zuordnungsmöglichkeit mehr — analog zum Haushaltsbuch-Löschen.
    const remaining = await Account.count({
      where: { householdId: account.householdId },
    });
    if (remaining <= 1) {
      return res.status(400).json({
        error: "Letztes Konto kann nicht gelöscht werden. Erst neues anlegen.",
      });
    }
    await account.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
