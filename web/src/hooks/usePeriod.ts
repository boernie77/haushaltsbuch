// Zentraler Period-Hook für alle Web-Seiten mit Monats-Navigation.
// Liest aus dem globalen `periodStore` (Memory-State, session-übergreifend),
// fällt auf die aktuelle Period zurück wenn der User nichts ausgewählt hat,
// und stellt Helper für die Pfeil-Navigation + Label-Formatierung bereit.
//
// Wichtig: `monthStartDay > 1` → Period-Label folgt End-Monat (siehe
// CLAUDE.md "Monatszeitraum"-Section). 27.03.–26.04. = "April".
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useCallback, useMemo } from "react";
import { usePeriodStore } from "../store/periodStore";

interface HouseholdLike {
  monthStartDay?: number;
}

export function usePeriod(currentHousehold: HouseholdLike | null | undefined) {
  const { selectedMonth, selectedYear, setPeriod } = usePeriodStore();
  const startDay = currentHousehold?.monthStartDay || 1;

  const currentPeriod = useMemo(() => {
    const now = new Date();
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    if (startDay > 1 && now.getDate() >= startDay) {
      if (m === 12) {
        m = 1;
        y += 1;
      } else {
        m += 1;
      }
    }
    return { month: m, year: y };
  }, [startDay]);

  const effectiveMonth = selectedMonth ?? currentPeriod.month;
  const effectiveYear = selectedYear ?? currentPeriod.year;

  const setSelectedMonth = useCallback(
    (m: number) => setPeriod(m, effectiveYear),
    [effectiveYear, setPeriod]
  );
  const setSelectedYear = useCallback(
    (y: number) => setPeriod(effectiveMonth, y),
    [effectiveMonth, setPeriod]
  );

  const prevPeriod = useCallback(() => {
    if (effectiveMonth === 1) {
      setPeriod(12, effectiveYear - 1);
    } else {
      setPeriod(effectiveMonth - 1, effectiveYear);
    }
  }, [effectiveMonth, effectiveYear, setPeriod]);

  const nextPeriod = useCallback(() => {
    if (effectiveMonth === 12) {
      setPeriod(1, effectiveYear + 1);
    } else {
      setPeriod(effectiveMonth + 1, effectiveYear);
    }
  }, [effectiveMonth, effectiveYear, setPeriod]);

  const resetToCurrent = useCallback(() => {
    setPeriod(currentPeriod.month, currentPeriod.year);
  }, [currentPeriod.month, currentPeriod.year, setPeriod]);

  const getPeriodLabel = useCallback(
    (m: number, y: number) => {
      if (startDay <= 1) {
        return format(new Date(y, m - 1, 1), "MMMM yyyy", { locale: de });
      }
      const start = new Date(y, m - 2, startDay);
      const end = new Date(y, m - 1, startDay - 1);
      return `${format(start, "d. MMM", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
    },
    [startDay]
  );

  const isCurrent =
    effectiveMonth === currentPeriod.month &&
    effectiveYear === currentPeriod.year;

  return {
    selectedMonth: effectiveMonth,
    selectedYear: effectiveYear,
    setSelectedMonth,
    setSelectedYear,
    setPeriod,
    currentPeriod,
    isCurrent,
    prevPeriod,
    nextPeriod,
    resetToCurrent,
    getPeriodLabel,
    startDay,
  };
}
