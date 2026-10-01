// Entwurf der Bank-Sync-Import-Vorschau: übersteht Seitenwechsel (z.B. kurz
// zu Buchungen, um etwas nachzuschauen oder eine Kategorie anzulegen) und ein
// Neuladen des Tabs. sessionStorage statt localStorage: der Entwurf soll nicht
// tagelang liegen bleiben. Die Datei selbst (File) lässt sich nicht
// serialisieren und lebt nur im Speicher — für den Import wird sie nicht
// gebraucht, nur für eine erneute Vorschau mit geänderter Spaltenzuordnung.
import { useCallback, useRef } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface DraftState {
  file: File | null;
  reset: () => void;
  setFile: (file: File | null) => void;
  setValue: (key: string, value: unknown) => void;
  values: Record<string, unknown>;
}

export const useBankSyncDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      file: null,
      values: {},
      setFile: (file) => set({ file }),
      setValue: (key, value) =>
        set((state) => ({ values: { ...state.values, [key]: value } })),
      reset: () => set({ file: null, values: {} }),
    }),
    {
      name: "bank-sync-draft",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ values: state.values }),
    }
  )
);

type SetDraft<T> = (next: T | ((prev: T) => T)) => void;

// Wie useState, aber im Entwurfs-Store abgelegt.
export function useDraftState<T>(key: string, initial: T): [T, SetDraft<T>] {
  const initialRef = useRef(initial);
  const stored = useBankSyncDraftStore((s) => s.values[key]) as T | undefined;
  const setValue = useBankSyncDraftStore((s) => s.setValue);
  const update = useCallback<SetDraft<T>>(
    (next) => {
      const current = useBankSyncDraftStore.getState().values[key] as
        | T
        | undefined;
      const prev = current === undefined ? initialRef.current : current;
      const value =
        typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      setValue(key, value);
    },
    [key, setValue]
  );
  return [stored === undefined ? initialRef.current : stored, update];
}
