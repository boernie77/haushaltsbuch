import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'haushaltsbuch-cache' });

// ── Generischer Cache ─────────────────────────────────────────────────────────

export const cache = {
  get: <T>(key: string): T | null => {
    try {
      const json = storage.getString(key);
      return json ? JSON.parse(json) : null;
    } catch { return null; }
  },
  set: (key: string, value: any) => {
    try { storage.set(key, JSON.stringify(value)); } catch {}
  },
  delete: (key: string) => {
    try { storage.delete(key); } catch {}
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

export const offlineQueue = {
  getAll: (): OfflineTransaction[] => cache.get('offline_tx_queue') || [],
  add: (tx: Omit<OfflineTransaction, '_offlineId' | '_queuedAt'>) => {
    const q = offlineQueue.getAll();
    q.push({ ...tx, _offlineId: `offline_${Date.now()}`, _queuedAt: Date.now() });
    cache.set('offline_tx_queue', q);
  },
  remove: (offlineId: string) => {
    const q = offlineQueue.getAll().filter(t => t._offlineId !== offlineId);
    cache.set('offline_tx_queue', q);
  },
  clear: () => cache.delete('offline_tx_queue'),
};

// ── Netzwerkfehler-Erkennung ─────────────────────────────────────────────────

export function isNetworkError(err: any): boolean {
  return !err.response && (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK' || err.message === 'Network Error');
}
