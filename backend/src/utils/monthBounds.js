/**
 * Calculate month period boundaries based on a custom start day.
 *
 * When startDay > 1, the period named "April" runs from
 * (startDay) of March until (startDay - 1) of April — i.e. the
 * period label corresponds to the calendar month at the END of
 * the period, not at the start. This matches user intuition:
 * salary on the 27th funds the upcoming month.
 *
 * Examples:
 *   startDay=1, month=3  → Mar 1   00:00:00 … Mar 31  23:59:59
 *   startDay=15, month=3 → Feb 15  00:00:00 … Mar 14  23:59:59
 *   startDay=27, month=4 → Mar 27  00:00:00 … Apr 26  23:59:59
 *
 * @param {number} year
 * @param {number} month  1-based (1=January)
 * @param {number} startDay  1-28, default 1
 * @returns {{ start: Date, end: Date }}
 */
function getMonthBounds(year, month, startDay = 1) {
  const day = startDay >= 1 && startDay <= 28 ? startDay : 1;
  if (day === 1) {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }
  const start = new Date(year, month - 2, day);
  const end = new Date(year, month - 1, day - 1, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Determine which period label (year/month) a given date falls into,
 * given a custom month start day.
 *
 * When startDay > 1, a date on or after the start day belongs to the
 * NEXT calendar month's period (e.g. 27.03. with startDay=27 → April).
 *
 * Examples (startDay=27):
 *   Mar 26 → period March  (Feb 27 – Mar 26)
 *   Mar 27 → period April  (Mar 27 – Apr 26)
 *   Apr 26 → period April  (Mar 27 – Apr 26)
 *   Apr 27 → period May    (Apr 27 – May 26)
 *
 * @param {Date|string} date
 * @param {number} startDay  1-28, default 1
 * @returns {{ year: number, month: number }}
 */
function getPeriodForDate(date, startDay = 1) {
  const d = new Date(date);
  const day = startDay >= 1 && startDay <= 28 ? startDay : 1;
  if (day === 1) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  if (d.getDate() < day) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  // On or after the start day → belongs to the next period
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

module.exports = { getMonthBounds, getPeriodForDate };
