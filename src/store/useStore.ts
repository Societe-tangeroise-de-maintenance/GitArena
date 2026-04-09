import { create } from 'zustand';
import type { DevStats, FeedItem, Member, Belts, ShamePR } from '../types';
import { CONFIG } from '../config';
import { XP_VALUES, getLevel } from '../lib/xp';
import { saveState, loadState } from '../lib/storage';
import { monthStart, isBot } from '../lib/github';

// ── Helpers ──────────────────────────────────────

function emptyStats(login: string): DevStats {
  return {
    login,
    weeklyXp: 0,
    totalXp: 0,
    weeklyCommits: 0,
    weeklyPRsOpened: 0,
    weeklyPRsMerged: 0,
    weeklyPRsReviewed: 0,
    weeklyIssuesClosed: 0,
    weeklyLinesAdded: 0,
    weeklyLinesDeleted: 0,
    dailyCommits: 0,
    dailyIssuesClosed: 0,
    streak: 0,
    longestStreak: 0,
    streakLastDate: null,
    lastActivityTime: null,
    lastCommitDate: null,
    badges: [],
  };
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Store types ──────────────────────────────────

interface AppState {
  members: Member[];
  stats: Record<string, DevStats>;
  feed: FeedItem[];
  bossProgress: Record<string, number>;
  bossIndex: number;
  previousRanks: Record<string, number>;
  belts: Belts;
  shamePRs: ShamePR[];
  spotlightMode: number;
  weekStartDate: string;
  isDemo: boolean;
  overlayQueue: Array<{ type: string; payload: Record<string, unknown> }>;

  // Actions
  setMembers: (m: Member[]) => void;
  addXp: (login: string, amount: number, type: FeedItem['type'], repo: string, message: string, detail?: string, eventTime?: string) => void;
  bumpStreak: (login: string) => void;
  awardBadge: (login: string, badgeId: string) => void;
  incrementStat: (login: string, field: keyof Pick<DevStats, 'weeklyCommits' | 'weeklyPRsOpened' | 'weeklyPRsMerged' | 'weeklyPRsReviewed' | 'weeklyIssuesClosed' | 'dailyCommits' | 'dailyIssuesClosed'>, delta?: number) => void;
  addLines: (login: string, added: number, deleted: number) => void;
  setBossProgress: (metric: string, value: number) => void;
  setShamePRs: (prs: ShamePR[]) => void;
  setBelts: (belts: Belts) => void;
  setSpotlightMode: (mode: number) => void;
  nextSpotlight: () => void;
  ensureMember: (login: string, avatarUrl?: string) => void;
  applySyncData: (data: Array<{ login: string; avatarUrl: string; xp: number; commits: number; prOpens: number; prMerges: number; issueCloses: number }>, feedItems: FeedItem[]) => void;
  pushOverlay: (overlay: { type: string; payload: Record<string, unknown> }) => void;
  popOverlay: () => void;
  checkWeeklyReset: () => void;
  persist: () => void;
  hydrate: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  members: [],
  stats: {},
  feed: [],
  bossProgress: {},
  bossIndex: 0,
  previousRanks: {},
  belts: { reviewer: null, closer: null, speedKing: null },
  shamePRs: [],
  spotlightMode: 0,
  weekStartDate: monthStart(),
  isDemo: CONFIG.pat === 'ghp_YOUR_PAT_HERE',
  overlayQueue: [],

  setMembers: (members) => {
    const existing = get().members;
    const stats = { ...get().stats };
    const loginSet = new Set(existing.map((m) => m.login));
    const merged = [...existing];
    for (const m of members) {
      if (!loginSet.has(m.login)) {
        merged.push(m);
        loginSet.add(m.login);
      } else {
        // Update avatarUrl if missing
        const idx = merged.findIndex((e) => e.login === m.login);
        if (idx >= 0 && !merged[idx].avatarUrl && m.avatarUrl) {
          merged[idx] = { ...merged[idx], avatarUrl: m.avatarUrl };
        }
      }
      if (!stats[m.login]) stats[m.login] = emptyStats(m.login);
    }
    set({ members: merged, stats });
  },

  ensureMember: (login, avatarUrl) => {
    if (isBot(login)) return;
    const existing = get().members;
    if (existing.find((m) => m.login === login)) {
      // Update avatarUrl if we now have one and didn't before
      if (avatarUrl) {
        const m = existing.find((m) => m.login === login);
        if (m && !m.avatarUrl) {
          set({ members: existing.map((m) => m.login === login ? { ...m, avatarUrl } : m) });
        }
      }
      return;
    }
    const COLORS = ['#3b82f6', '#a78bfa', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];
    const color = COLORS[existing.length % COLORS.length];
    const member: Member = { login, name: login, color, avatarUrl: avatarUrl || '' };
    const stats = { ...get().stats };
    if (!stats[login]) stats[login] = emptyStats(login);
    set({ members: [...existing, member], stats });
  },

  addXp: (login, amount, type, repo, message, detail, eventTime) => {
    if (isBot(login)) return;
    get().ensureMember(login);
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    const oldLevel = getLevel(s.totalXp).level;
    s.weeklyXp += amount;
    s.totalXp += amount;
    console.log(`[GitArena] +${amount}xp ${login} (${type}) → ${s.weeklyXp}xp total`);
    s.lastActivityTime = eventTime || new Date().toISOString();
    stats[login] = s;

    const feedItem: FeedItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      user: login,
      repo,
      message,
      detail: detail || '',
      xp: amount,
      time: eventTime || new Date().toISOString(),
    };
    const feed = [feedItem, ...get().feed]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 50);

    const newLevel = getLevel(s.totalXp).level;
    const overlayQueue = [...get().overlayQueue];
    if (newLevel > oldLevel && overlayQueue.length < 3) {
      overlayQueue.push({
        type: 'level-up',
        payload: { login, level: newLevel, title: getLevel(s.totalXp).title },
      });
    }

    // Check rank overtaken
    const ranked = rankedLogins(stats);
    const prevRanks = get().previousRanks;
    const newRank = ranked.indexOf(login) + 1;
    const oldRank = prevRanks[login] || newRank;
    if (newRank < oldRank && oldRank > 1 && overlayQueue.length < 3) {
      overlayQueue.push({
        type: 'overtaken',
        payload: { login, newRank, oldRank },
      });
    }

    // Update previousRanks snapshot
    const newPreviousRanks: Record<string, number> = {};
    ranked.forEach((l, i) => { newPreviousRanks[l] = i + 1; });

    set({ stats, feed, overlayQueue, previousRanks: newPreviousRanks });
  },

  bumpStreak: (login) => {
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    const d = today();
    if (s.streakLastDate === d) return;
    if (s.streakLastDate) {
      const last = new Date(s.streakLastDate);
      const now = new Date(d);
      const diff = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
      s.streak = diff <= 1 ? s.streak + 1 : 1;
    } else {
      s.streak = 1;
    }
    s.streakLastDate = d;
    if (s.streak > s.longestStreak) s.longestStreak = s.streak;

    // Streak bonus at 3, 5, 7, 10, 14, 21, 30
    if ([3, 5, 7, 10, 14, 21, 30].includes(s.streak)) {
      s.weeklyXp += XP_VALUES.streakBonus;
      s.totalXp += XP_VALUES.streakBonus;
    }

    stats[login] = s;
    set({ stats });

    // Auto-detect streak badges
    if (s.streak >= 30 && !s.badges.includes('ironDev')) get().awardBadge(login, 'ironDev');
    else if (s.streak >= 7 && !s.badges.includes('streakMaster')) get().awardBadge(login, 'streakMaster');
  },

  awardBadge: (login, badgeId) => {
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    if (s.badges.includes(badgeId)) return;
    s.badges = [...s.badges, badgeId];
    stats[login] = s;
    const overlayQueue = [...get().overlayQueue, {
      type: 'achievement',
      payload: { login, badgeId },
    }];
    set({ stats, overlayQueue });
  },

  incrementStat: (login, field, delta = 1) => {
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    (s[field] as number) += delta;
    stats[login] = s;
    set({ stats });

    // Auto-detect count-based badges
    if (field === 'weeklyIssuesClosed' && s.weeklyIssuesClosed >= 10 && !s.badges.includes('ghostSlayer')) {
      get().awardBadge(login, 'ghostSlayer');
    }
    if (field === 'dailyIssuesClosed' && s.dailyIssuesClosed >= 5 && !s.badges.includes('closer')) {
      get().awardBadge(login, 'closer');
    }
  },

  addLines: (login, added, deleted) => {
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    s.weeklyLinesAdded += added;
    s.weeklyLinesDeleted += deleted;
    stats[login] = s;
    set({ stats });
  },

  setBossProgress: (metric, value) => {
    const bp = { ...get().bossProgress, [metric]: value };
    const goal = CONFIG.bossGoals[get().bossIndex];
    const overlayQueue = [...get().overlayQueue];

    if (goal) {
      const total = CONFIG.bossGoals.reduce((acc, g) => {
        const v = bp[g.metric] || 0;
        return acc + (v >= g.target ? 1 : 0);
      }, 0);
      if (total === CONFIG.bossGoals.length) {
        overlayQueue.push({ type: 'boss-victory', payload: { bossIndex: get().bossIndex } });
        set({ bossProgress: {}, bossIndex: get().bossIndex + 1, overlayQueue });
        return;
      }
    }
    set({ bossProgress: bp, overlayQueue });
  },

  setShamePRs: (prs) => set({ shamePRs: prs }),
  setBelts: (belts) => set({ belts }),

  setSpotlightMode: (mode) => set({ spotlightMode: mode }),
  nextSpotlight: () => set((s) => ({ spotlightMode: (s.spotlightMode + 1) % 8 })),

  applySyncData: (data, feedItems) => {
    const stats = { ...get().stats };
    const members = [...get().members];
    const loginSet = new Set(members.map(m => m.login));
    const COLORS = ['#3b82f6', '#a78bfa', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

    for (const d of data) {
      // Ensure member exists
      if (!loginSet.has(d.login)) {
        loginSet.add(d.login);
        members.push({ login: d.login, name: d.login, color: COLORS[members.length % COLORS.length], avatarUrl: d.avatarUrl });
      }
      if (!stats[d.login]) stats[d.login] = emptyStats(d.login);
      const s = { ...stats[d.login] };

      // Use max() so we never regress below search-computed values,
      // but allow poller to push above if it has newer data
      if (d.xp > s.weeklyXp) {
        s.weeklyXp = d.xp;
        s.totalXp = d.xp;
      }
      if (d.commits > s.weeklyCommits) s.weeklyCommits = d.commits;
      if (d.prOpens > s.weeklyPRsOpened) s.weeklyPRsOpened = d.prOpens;
      if (d.prMerges > s.weeklyPRsMerged) s.weeklyPRsMerged = d.prMerges;
      if (d.issueCloses > s.weeklyIssuesClosed) s.weeklyIssuesClosed = d.issueCloses;
      stats[d.login] = s;
    }

    // Merge feed items (keep newest 50)
    const existingFeed = get().feed;
    const existingIds = new Set(existingFeed.map(f => f.id));
    const newItems = feedItems.filter(f => !existingIds.has(f.id));
    const feed = [...existingFeed, ...newItems]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 50);

    console.log(`[GitArena:sync] Applied sync data for ${data.length} users, ${newItems.length} new feed items`);
    set({ stats, members, feed });
  },

  pushOverlay: (overlay) => set((s) => ({ overlayQueue: [...s.overlayQueue, overlay] })),
  popOverlay: () => set((s) => ({ overlayQueue: s.overlayQueue.slice(1) })),

  checkWeeklyReset: () => {
    const ms = monthStart();
    if (ms !== get().weekStartDate) {
      const stats = { ...get().stats };
      for (const login of Object.keys(stats)) {
        const s = { ...stats[login] };
        s.weeklyXp = 0;
        s.weeklyCommits = 0;
        s.weeklyPRsOpened = 0;
        s.weeklyPRsMerged = 0;
        s.weeklyPRsReviewed = 0;
        s.weeklyIssuesClosed = 0;
        s.weeklyLinesAdded = 0;
        s.weeklyLinesDeleted = 0;
        s.dailyCommits = 0;
        s.dailyIssuesClosed = 0;
        stats[login] = s;
      }
      set({ stats, weekStartDate: ms, bossProgress: {}, previousRanks: {} });
    }
  },

  persist: () => {
    const s = get();
    saveState({
      devStats: s.stats,
      bossProgress: s.bossProgress,
      bossIndex: s.bossIndex,
      previousRanks: s.previousRanks,
      belts: s.belts,
      weekStart: s.weekStartDate,
      feed: s.feed,
    });
  },

  hydrate: () => {
    const saved = loadState();
    if (!saved) return;
    set({
      stats: saved.devStats as Record<string, DevStats>,
      bossProgress: saved.bossProgress,
      bossIndex: saved.bossIndex,
      previousRanks: saved.previousRanks,
      belts: saved.belts,
      weekStartDate: saved.weekStart,
      feed: (saved.feed || []) as FeedItem[],
    });
  },
}));

// Expose debug tool on window for testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__gitarena = {
    getState: () => useStore.getState(),
    getStats: () => useStore.getState().stats,
    getRanking: () => rankedLogins(useStore.getState().stats).map((login, i) => {
      const s = useStore.getState().stats[login];
      return `#${i + 1} ${login}: ${s?.weeklyXp || 0} XP`;
    }),
    getFeed: () => useStore.getState().feed.slice(0, 10),
    forceReset: () => {
      localStorage.removeItem('gitarena_state');
      localStorage.removeItem('gitarena_seenIds');
      localStorage.removeItem('gitarena_schema');
      location.reload();
    },
  };
}

// Helper selector
export function rankedLogins(stats: Record<string, DevStats>): string[] {
  return Object.values(stats)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .map((s) => s.login);
}
