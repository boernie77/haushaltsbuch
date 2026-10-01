// Kalender-Feature: liefert pro Kalendertag die Buchungen + den Konto-Saldo
// am Ende dieses Tages. Daueraufträge (Templates) werden für zukünftige Tage
// projiziert, damit der Kalender eine echte Vorausschau zeigt. Reale Kopien
// existieren erst ab recurringNextDate-1 rückwärts (vom Cron erzeugt), darum
// startet die Projektion exakt bei recurringNextDate → kein Doppelzählen.
const router = require("express").Router();
const { Op } = require("sequelize");
const {
  Account,
  Category,
  HouseholdMember,
  Transaction,
} = require("../models");
const { auth } = require("../middleware/auth");

function pad(n) {
  return String(n).padStart(2, "0");
}

// UTC-basiert, damit DATEONLY-Strings ("YYYY-MM-DD") nicht durch
// Zeitzonen-Verschiebung um einen Tag springen.
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Nächstes Fälligkeitsdatum einer wiederkehrenden Buchung — identische Logik
// wie cronService.calcNextDate, aber UTC-basiert.
function calcNextDate(interval, recurringDay, fromDate) {
  const d = new Date(fromDate);
  if (interval === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (interval === "monthly") {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (recurringDay) {
      const maxDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
      ).getUTCDate();
      d.setUTCDate(Math.min(recurringDay, maxDay));
    }
  } else if (interval === "yearly") {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    return null;
  }
  return d;
}

function categoryJSON(c) {
  if (!c) {
    return null;
  }
  return {
    id: c.id,
    name: c.name,
    nameDE: c.nameDE,
    icon: c.icon,
    color: c.color,
  };
}

// GET /api/calendar?householdId=&year=&month=
// month = Kalendermonat (1-12), unabhängig von monthStartDay — ein Kalender
// zeigt echte Tage.
// Netto-Bewegung echter Buchungen je Konto bis einschließlich Stichtag
// (Einnahmen + eingehende Umbuchungen − Ausgaben − ausgehende Umbuchungen).
// Gleiche Filter wie accounts.js#computeBalance.
async function netRealMovementsUntilStichtag(householdId, accounts) {
  const net = {};
  for (const account of accounts) {
    if (!account.startingBalanceDate) {
      continue;
    }
    const where = {
      householdId,
      isRecurring: { [Op.ne]: true },
      affectsAccountBalance: { [Op.ne]: false },
      date: { [Op.lte]: account.startingBalanceDate },
    };
    // eslint-disable-next-line no-await-in-loop
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
    net[account.id] =
      (Number(income) || 0) +
      (Number(transferIn) || 0) -
      (Number(expense) || 0) -
      (Number(transferOut) || 0);
  }
  return net;
}

router.get("/", auth, async (req, res) => {
  try {
    const { householdId } = req.query;
    const year = Number.parseInt(req.query.year, 10);
    const month = Number.parseInt(req.query.month, 10);
    if (!(householdId && year && month)) {
      return res
        .status(400)
        .json({ error: "householdId, year & month required" });
    }
    if (
      !(await HouseholdMember.findOne({
        where: { userId: req.user.id, householdId },
      }))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Gitter: Montag der Woche des 1. bis Sonntag der Woche des Letzten.
    const first = new Date(Date.UTC(year, month - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Tage seit Montag
    const gridStart = new Date(first);
    gridStart.setUTCDate(1 - lead);
    const last = new Date(Date.UTC(year, month, 0));
    const trail = 6 - ((last.getUTCDay() + 6) % 7); // Tage bis Sonntag
    const gridEnd = new Date(last);
    gridEnd.setUTCDate(last.getUTCDate() + trail);
    const gridStartStr = fmtDate(gridStart);
    const gridEndStr = fmtDate(gridEnd);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const accounts = await Account.findAll({
      where: { householdId },
      order: [
        ["sortOrder", "ASC"],
        ["createdAt", "ASC"],
      ],
    });
    const accountsById = {};
    for (const a of accounts) {
      accountsById[a.id] = a;
    }

    // Alle realen Buchungen bis Gitter-Ende (kumulativer Saldo nötig).
    const realTx = await Transaction.findAll({
      where: {
        householdId,
        isRecurring: { [Op.ne]: true },
        date: { [Op.lte]: gridEndStr },
      },
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
      ],
      order: [["date", "ASC"]],
    });

    // Wiederkehrende Templates → Vorschau-Buchungen ab recurringNextDate.
    const templates = await Transaction.findAll({
      where: { householdId, isRecurring: true },
      include: [
        {
          model: Category,
          attributes: ["id", "name", "nameDE", "icon", "color"],
        },
      ],
    });
    const projected = [];
    for (const t of templates) {
      if (!t.recurringNextDate) {
        continue;
      }
      let occ = parseDate(t.recurringNextDate);
      let guard = 0;
      while (fmtDate(occ) <= gridEndStr && guard < 1000) {
        guard += 1;
        const occStr = fmtDate(occ);
        if (t.recurringEndDate && occStr > t.recurringEndDate) {
          break;
        }
        projected.push({
          id: `proj-${t.id}-${occStr}`,
          date: occStr,
          type: t.type,
          amount: Number(t.amount) || 0,
          description: t.description,
          merchant: t.merchant,
          category: categoryJSON(t.Category),
          accountId: t.accountId,
          transferTargetAccountId: t.transferTargetAccountId,
          projected: true,
          affectsBalance: true,
        });
        const next = calcNextDate(t.recurringInterval, t.recurringDay, occ);
        if (!next) {
          break;
        }
        occ = next;
      }
    }

    // Display-Buchungen (real + projiziert).
    const displayTx = [
      ...realTx.map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        amount: Number(t.amount) || 0,
        description: t.description,
        merchant: t.merchant,
        category: categoryJSON(t.Category),
        accountId: t.accountId,
        transferTargetAccountId: t.transferTargetAccountId,
        projected: false,
        affectsBalance: t.affectsAccountBalance !== false,
      })),
      ...projected,
    ];

    // Saldo-Events (nur balance-wirksame Buchungen), nach Datum sortiert.
    const events = displayTx
      .filter((t) => t.affectsBalance)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Stichtag-Saldo gilt auch RÜCKWÄRTS: Der Startwert wird so gewählt, dass
    // nach Anwenden aller echten Buchungen bis einschließlich Stichtag genau
    // der eingegebene Stand herauskommt. Damit stimmen Tage vor dem Stichtag
    // (Stand = Stichtag-Saldo − Bewegungen danach bis zum Stichtag) ebenso wie
    // Tage danach. Beispiel: heute Ist-Stand eingeben → Anfang September wird
    // aus den Buchungen zurückgerechnet.
    const netUntilStichtag = await netRealMovementsUntilStichtag(
      householdId,
      accounts
    );
    const balances = {};
    for (const a of accounts) {
      balances[a.id] =
        (Number(a.startingBalance) || 0) - (netUntilStichtag[a.id] || 0);
    }
    const applyEvent = (ev) => {
      const amt = Number(ev.amount) || 0;
      const addTo = (accId, delta) => {
        if (!accId || balances[accId] === undefined) {
          return;
        }
        const acc = accountsById[accId];
        // Projizierte Daueraufträge vor/am Stichtag sind nicht real und
        // stecken nicht im eingegebenen Saldo.
        if (
          ev.projected &&
          acc.startingBalanceDate &&
          ev.date <= acc.startingBalanceDate
        ) {
          return;
        }
        balances[accId] += delta;
      };
      if (ev.type === "income") {
        addTo(ev.accountId, amt);
      } else if (ev.type === "expense") {
        addTo(ev.accountId, -amt);
      } else if (ev.type === "transfer") {
        addTo(ev.accountId, -amt);
        addTo(ev.transferTargetAccountId, amt);
      }
    };

    // Buchungen je Tag gruppieren (nur sichtbares Gitter).
    const txByDay = {};
    for (const t of displayTx) {
      if (t.date < gridStartStr || t.date > gridEndStr) {
        continue;
      }
      (txByDay[t.date] ||= []).push(t);
    }

    // Eröffnungssaldo zu gridStart: alle Events davor anwenden.
    let evIdx = 0;
    while (evIdx < events.length && events[evIdx].date < gridStartStr) {
      applyEvent(events[evIdx]);
      evIdx += 1;
    }

    const round2 = (n) => Math.round(n * 100) / 100;
    const days = [];
    for (
      let d = new Date(gridStart);
      fmtDate(d) <= gridEndStr;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dateStr = fmtDate(d);
      while (evIdx < events.length && events[evIdx].date === dateStr) {
        applyEvent(events[evIdx]);
        evIdx += 1;
      }
      const snapshot = {};
      let total = 0;
      for (const a of accounts) {
        const v = round2(balances[a.id]);
        snapshot[a.id] = v;
        total += v;
      }
      const dayTx = (txByDay[dateStr] || []).sort((a, b) =>
        a.projected === b.projected ? 0 : a.projected ? 1 : -1
      );
      days.push({
        date: dateStr,
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === month - 1,
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
        balances: snapshot,
        total: round2(total),
        transactions: dayTx,
      });
    }

    res.json({
      year,
      month,
      gridStart: gridStartStr,
      gridEnd: gridEndStr,
      today: todayStr,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        type: a.type,
        startingBalance: Number(a.startingBalance),
        startingBalanceDate: a.startingBalanceDate,
      })),
      days,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Fehler: ${err.message}` });
  }
});

module.exports = router;
