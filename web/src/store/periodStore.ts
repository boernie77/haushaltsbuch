// Globaler Periode-Store: hält den aktuell ausgewählten Monat/Jahr session-
// übergreifend (aber NICHT persistent über Browser-Sessions hinaus — sonst
// würde man bei einem Besuch nach Tagen weiterhin alte Monate sehen).
//
// `month === null` heißt "kein User-Override, automatisch aktuelle Period
// gemäß monthStartDay des Haushaltsbuchs verwenden". Sobald der User per
// Pfeil-Navigation eine andere Period wählt, wird hier festgehalten.
import { create } from "zustand";

interface PeriodState {
  resetToCurrent: () => void;
  selectedMonth: number | null;
  selectedYear: number | null;
  setPeriod: (month: number, year: number) => void;
}

export const usePeriodStore = create<PeriodState>((set) => ({
  selectedMonth: null,
  selectedYear: null,
  setPeriod: (selectedMonth, selectedYear) =>
    set({ selectedMonth, selectedYear }),
  resetToCurrent: () => set({ selectedMonth: null, selectedYear: null }),
}));
