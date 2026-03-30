import * as FileSystem from 'expo-file-system';

const BASE = FileSystem.documentDirectory + 'cache/';

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(BASE);
  if (!info.exists) await FileSystem.makeDirectoryAsync(BASE, { intermediates: true });
}

function keyToPath(key: string) {
  return BASE + key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

// ── Generischer Cache ─────────────────────────────────────────────────────────

export const cache = {
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const path = keyToPath(key);
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return null;
      const json = await FileSystem.readAsStringAsync(path);
      return JSON.parse(json);
    } catch { return null; }
  },
  set: async (key: string, value: any): Promise<void> => {
    try {
      await ensureDir();
      await FileSystem.writeAsStringAsync(keyToPath(key), JSON.stringify(value));
    } catch {}
  },
  delete: async (key: string): Promise<void> => {
    try { await FileSystem.deleteAsync(keyToPath(key), { idempotent: true }); } catch {}
  },
};

// ── Offline-Queue für neue Buchungen ─────────────────────────────────────────

export interface OfflineTransaction {
  _offlineId: string;
  _queuedAt: number;
  amount: string;
  description: string;
  merchant: string;
  date: string;
  type: 'expense' | 'income';
  categoryId: string | null;
  householdId: string;
}

const QUEUE_KEY = 'offline_tx_queue';

export const offlineQueue = {
  getAll: async (): Promise<OfflineTransaction[]> => {
    return (await cache.get<OfflineTransaction[]>(QUEUE_KEY)) || [];
  },
  add: async (tx: Omit<OfflineTransaction, '_offlineId' | '_queuedAt'>): Promise<void> => {
    const q = await offlineQueue.getAll();
    q.push({ ...tx, _offlineId: `offline_${Date.now()}`, _queuedAt: Date.now() });
    await cache.set(QUEUE_KEY, q);
  },
  remove: async (offlineId: string): Promise<void> => {
    const q = (await offlineQueue.getAll()).filter(t => t._offlineId !== offlineId);
    await cache.set(QUEUE_KEY, q);
  },
  clear: async (): Promise<void> => {
    await cache.delete(QUEUE_KEY);
  },
};

// ── Netzwerkfehler-Erkennung ─────────────────────────────────────────────────

export function isNetworkError(err: any): boolean {
  return !err.response && (
    err.code === 'ECONNABORTED' ||
    err.code === 'ERR_NETWORK' ||
    err.message === 'Network Error'
  );
}
