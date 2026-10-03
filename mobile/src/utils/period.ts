import { format } from "date-fns";

// Sub-Konto-Monat (z.B. Spesen) für "Neue Buchung" und Schnellerfassung.

export const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Period {
  month: number;
  year: number;
}

// Wie backend utils/monthBounds.js#getPeriodForDate: Bei monthStartDay > 1
// gehört ein Datum ab dem Starttag zum Folgemonat (Label = End-Monat).
// Ungültiges Datum (z.B. halb getippt) → heute.
export function periodForDate(iso: string, startDay: number): Period {
  const valid = ISO_DATE.test(iso) ? iso : format(new Date(), "yyyy-MM-dd");
  const [year, month, day] = valid.split("-").map(Number);
  if (startDay > 1 && day >= startDay) {
    return month === 12
      ? { year: year + 1, month: 1 }
      : { year, month: month + 1 };
  }
  return { year, month };
}

export function shiftPeriod(p: Period, delta: number): Period {
  const index = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const periodLabel = (p: Period) =>
  `${MONTH_NAMES[p.month - 1]} ${p.year}`;
