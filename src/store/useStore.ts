import { create } from 'zustand';
import type { DevStats, FeedItem, Member, Belts, ShamePR } from '../types';
import { CONFIG } from '../config';
import { XP_VALUES, getLevel } from '../lib/xp';
import { saveState, loadState } from '../lib/storage';
import { weekStart, isBot } from '../lib/github';

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
  weekStartDate: weekStart(),
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
    const feed = [feedItem, ...get().feed].slice(0, 50);

    const newLevel = getLevel(s.totalXp).level;
    const overlayQueue = [...get().overlayQueue];
    if (newLevel > oldLevel && overlayQueue.length < 3) {
      overlayQueue.push({
        type: 'level-up',
        payload: { login, level: newLevel, title: getLevel(s.totalXp).title },
      });
    }

    // Check rank overtaken
    const ranked = rankedLogins(get().stats);
    const prevRanks = get().previousRanks;
    const newRank = ranked.indexOf(login) + 1;
    const oldRank = prevRanks[login] || newRank;
    if (newRank < oldRank && oldRank > 1 && overlayQueue.length < 3) {
      overlayQueue.push({
        type: 'overtaken',
        payload: { login, newRank, oldRank },
      });
    }

    set({ stats, feed, overlayQueue });
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
  },

  awardBadge: (login, badgeId) => {
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    if (s.badges.includes(badgeId)) return;
    s.badges = [...s.badges, badgeId];
    stats[login] = s;
    const overlayQueue = [...get().overlayQueue, {
      type: 'badge',
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

  pushOverlay: (overlay) => set((s) => ({ overlayQueue: [...s.overlayQueue, overlay] })),
  popOverlay: () => set((s) => ({ overlayQueue: s.overlayQueue.slice(1) })),

  checkWeeklyReset: () => {
    const ws = weekStart();
    if (ws !== get().weekStartDate) {
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
      set({ stats, weekStartDate: ws, bossProgress: {}, previousRanks: {} });
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
    });
  },
}));

// Helper selector
export function rankedLogins(stats: Record<string, DevStats>): string[] {
  return Object.values(stats)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .map((s) => s.login);
}
