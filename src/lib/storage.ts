const STORAGE_KEY = 'gitarena_state';
const SCHEMA_VERSION = 9;
const VERSION_KEY = 'gitarena_schema';

export interface PersistedState {
  devStats: Record<string, unknown>;
  bossProgress: Record<string, number>;
  bossIndex: number;
  previousRanks: Record<string, number>;
  belts: { reviewer: string | null; closer: string | null; speedKing: string | null };
  monthStart: string;
  feed?: unknown[];
  seenIds?: string[];
}

export function loadState(): PersistedState | null {
  try {
    const ver = localStorage.getItem(VERSION_KEY);
    if (ver !== '8' && ver !== String(SCHEMA_VERSION)) {
      clearState();
      localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as PersistedState & { weekStart?: string };
    if (ver === '8') {
      const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;
      const legacyStart = state.weekStart || state.monthStart;
      state.monthStart = legacyStart?.slice(0, 7) === currentMonth.slice(0, 7) ? currentMonth : legacyStart;
      const names = ['Xp', 'Commits', 'PRsOpened', 'PRsMerged', 'PRsReviewed', 'IssuesClosed', 'IssuesOpened', 'LinesAdded', 'LinesDeleted'];
      for (const value of Object.values(state.devStats || {})) {
        const row = value as Record<string, unknown>;
        for (const name of names) {
          row[`monthly${name}`] = row[`monthly${name}`] ?? row[`weekly${name}`] ?? 0;
          delete row[`weekly${name}`];
        }
      }
      delete state.weekStart;
      saveState(state);
    }
    return state;
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
