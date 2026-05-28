// Berechnet und persistiert den monatlichen "festen Saldo" eines Haushalts.
// Definition (Snapshot-Wert):
//   fixedIncome   = Summe aller aktuell aktiven wiederkehrenden Einnahmen,
//                   monatlich hochgerechnet (weekly × 52/12, yearly ÷ 12).
//   fixedExpenses = analog für Ausgaben.
//   balance       = fixedIncome − fixedExpenses
//
// Der Cron-Job ruft `snapshotPreviousMonth()` am 1. jeden Monats auf und friert
// den Wert für den ABGELAUFENEN Monat ein. Der aktuelle Monat wird beim Lesen
// live berechnet (nicht persistiert), damit die UI sofort einen Wert hat.

function monthlyEquivalent(amount, interval) {
  const a = Number.parseFloat(amount) || 0;
  if (interval === "weekly") {
    return a * (52 / 12);
  }
  if (interval === "yearly") {
    return a / 12;
  }
  return a; // monthly
}

async function computeFixedBalance(householdId) {
  const { Transaction } = require("../models");
  const recurring = await Transaction.findAll({
    where: { householdId, isRecurring: true },
  });
  let fixedIncome = 0;
  let fixedExpenses = 0;
  for (const r of recurring) {
    const v = monthlyEquivalent(r.amount, r.recurringInterval);
    if (r.type === "income") {
      fixedIncome += v;
    } else if (r.type === "expense") {
      fixedExpenses += v;
    }
  }
  return {
    fixedIncome: Number(fixedIncome.toFixed(2)),
    fixedExpenses: Number(fixedExpenses.toFixed(2)),
    balance: Number((fixedIncome - fixedExpenses).toFixed(2)),
  };
}

async function upsertSnapshot(householdId, year, month) {
  const { MonthlyFixedSnapshot } = require("../models");
  const values = await computeFixedBalance(householdId);
  const [snap, created] = await MonthlyFixedSnapshot.findOrCreate({
    where: { householdId, year, month },
    defaults: { ...values },
  });
  if (!created) {
    await snap.update(values);
  }
  return snap;
}

// Cron-Eintrittspunkt: für alle Haushalte den Snapshot des Vormonats erstellen.
// "Vormonat" wird pro Haushalt aus `monthStartDay` abgeleitet, damit der
// Snapshot mit dem Period-Schema des Haushaltsbuchs übereinstimmt
// (z.B. monthStartDay=27 → Snapshot am 1.5. friert die Period "April"
// = 27.03.–26.04. ein).
async function snapshotPreviousMonth() {
  try {
    const { Household } = require("../models");
    const { getPeriodForDate } = require("../utils/monthBounds");
    const now = new Date();

    const households = await Household.findAll({
      attributes: ["id", "name", "monthStartDay"],
    });
    for (const h of households) {
      try {
        const startDay = h.monthStartDay || 1;
        // "Vormonat" = aktuelle Period MINUS eins
        const currentPeriod = getPeriodForDate(now, startDay);
        const prevMonth =
          currentPeriod.month === 1 ? 12 : currentPeriod.month - 1;
        const prevYear =
          currentPeriod.month === 1
            ? currentPeriod.year - 1
            : currentPeriod.year;
        await upsertSnapshot(h.id, prevYear, prevMonth);
        console.log(
          `[fixed-balance] Snapshot ${prevYear}-${String(prevMonth).padStart(2, "0")} für ${h.name} (startDay=${startDay})`
        );
      } catch (err) {
        console.error(`[fixed-balance] Fehler bei ${h.name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error("[fixed-balance] Cron-Fehler:", err.message);
  }
}

module.exports = {
  monthlyEquivalent,
  computeFixedBalance,
  upsertSnapshot,
  snapshotPreviousMonth,
};
