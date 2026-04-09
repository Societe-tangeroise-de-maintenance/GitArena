const STORAGE_KEY = 'gitarena_state';
const SCHEMA_VERSION = 8; // Fix dedup keys + feed ordering
const VERSION_KEY = 'gitarena_schema';

export interface PersistedState {
  devStats: Record<string, unknown>;
  bossProgress: Record<string, number>;
  bossIndex: number;
  previousRanks: Record<string, number>;
  belts: { reviewer: string | null; closer: string | null; speedKing: string | null };
  weekStart: string;
  feed?: unknown[];
  seenIds?: string[];
}

export function loadState(): PersistedState | null {
  try {
    const ver = localStorage.getItem(VERSION_KEY);
    if (ver !== String(SCHEMA_VERSION)) {
      clearState();
      localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  } catch {
    // localStorage full or unavailable
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('gitarena_seenIds');
}
