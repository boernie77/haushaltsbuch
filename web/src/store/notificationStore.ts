// Protokoll aller Toast-Meldungen (Fehler, Erfolg, Info), damit man sie nach
// dem Verschwinden in der Glocke (Layout) wieder nachlesen kann. Bleibt im
// localStorage dieses Browsers; nichts davon geht an den Server.
import toast from "react-hot-toast";
import { create } from "zustand";

export type NotificationKind = "error" | "success" | "info";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  read: boolean;
  time: number;
}

const STORAGE_KEY = "notification_log";
const MAX_ENTRIES = 100;
// Fehler müssen lange genug lesbar bleiben (Bankcodes, Fehlertexte).
export const ERROR_TOAST_MS = 12_000;
export const DEFAULT_TOAST_MS = 5000;

function load(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

function save(items: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Speicher voll oder gesperrt: Protokoll bleibt dann nur im Speicher.
  }
}

interface NotificationState {
  add: (kind: NotificationKind, message: string) => void;
  clear: () => void;
  items: AppNotification[];
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: load(),
  add: (kind, message) => {
    const entry: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      message,
      read: false,
      time: Date.now(),
    };
    const items = [entry, ...get().items].slice(0, MAX_ENTRIES);
    save(items);
    set({ items });
  },
  markAllRead: () => {
    const items = get().items.map((n) => ({ ...n, read: true }));
    save(items);
    set({ items });
  },
  clear: () => {
    save([]);
    set({ items: [] });
  },
}));

let installed = false;

// Hängt das Protokoll an toast.error/success und verlängert die Anzeigedauer.
// Alle bisherigen Aufrufe im Code funktionieren unverändert.
export function installToastLogging() {
  if (installed) {
    return;
  }
  installed = true;
  const { add } = useNotificationStore.getState();
  const originalError = toast.error.bind(toast);
  const originalSuccess = toast.success.bind(toast);

  toast.error = (message, opts) => {
    if (typeof message === "string") {
      add("error", message);
    }
    return originalError(message, { duration: ERROR_TOAST_MS, ...opts });
  };
  toast.success = (message, opts) => {
    if (typeof message === "string") {
      add("success", message);
    }
    return originalSuccess(message, { duration: DEFAULT_TOAST_MS, ...opts });
  };
}
