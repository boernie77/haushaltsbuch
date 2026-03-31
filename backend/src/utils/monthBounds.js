/**
 * Calculate month period boundaries based on a custom start day.
 *
 * Example with startDay=15:
 *   month=3 (März) → Mar 15 00:00:00 … Apr 14 23:59:59
 *
 * @param {number} year
 * @param {number} month  1-based (1=January)
 * @param {number} startDay  1-28, default 1
 * @returns {{ start: Date, end: Date }}
 */
function getMonthBounds(year, month, startDay = 1) {
  const day = (startDay >= 1 && startDay <= 28) ? startDay : 1;
  if (day === 1) {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0, 23, 59, 59, 999)
    };
  }
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month, day - 1, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Determine which period label (year/month) a given date falls into,
 * given a custom month start day.
 *
 * Example with startDay=15:
 *   Mar 20 → period March  (Mar 15 – Apr 14)
 *   Mar 10 → period February (Feb 15 – Mar 14)
 *
 * @param {Date|string} date
 * @param {number} startDay  1-28, default 1
 * @returns {{ year: number, month: number }}
 */
function getPeriodForDate(date, startDay = 1) {
  const d = new Date(date);
  const day = (startDay >= 1 && startDay <= 28) ? startDay : 1;
  if (day === 1 || d.getDate() >= day) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  // Before the start day → belongs to the previous period
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

module.exports = { getMonthBounds, getPeriodForDate };
