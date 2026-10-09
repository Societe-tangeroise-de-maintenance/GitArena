import { create } from 'zustand';
import type { DevStats, FeedItem, Member, Belts, ShamePR, BossGoal, SeasonRecap, CiAlert } from '../types';
import { CONFIG } from '../config';
import { XP_VALUES, getLevel, updateXpConfig } from '../lib/xp';
import { saveState, loadState } from '../lib/storage';
import { monthStart, isBot } from '../lib/github';

// ── Helpers ──────────────────────────────────────

function emptyStats(login: string): DevStats {
  return {
    login,
    monthlyXp: 0,
    totalXp: 0,
    monthlyCommits: 0,
    monthlyPRsOpened: 0,
    monthlyPRsMerged: 0,
    monthlyPRsReviewed: 0,
    monthlyIssuesClosed: 0,
    monthlyIssuesOpened: 0,
    monthlyLinesAdded: 0,
    monthlyLinesDeleted: 0,
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
  bossGoals: BossGoal[];
  previousRanks: Record<string, number>;
  belts: Belts;
  shamePRs: ShamePR[];
  spotlightMode: number;
  monthStartDate: string;
  dayStartDate: string;
  isDemo: boolean;
  overlayQueue: Array<{ type: string; payload: Record<string, unknown> }>;
  lastSeason: SeasonRecap | null;
  ciAlerts: CiAlert[];
  activeDays: Record<string, number>;

  // Actions
  setMembers: (m: Member[]) => void;
  addXp: (login: string, amount: number, type: FeedItem['type'], repo: string, message: string, detail?: string, eventTime?: string) => void;
  bumpStreak: (login: string) => void;
  awardBadge: (login: string, badgeId: string) => void;
  incrementStat: (login: string, field: keyof Pick<DevStats, 'monthlyCommits' | 'monthlyPRsOpened' | 'monthlyPRsMerged' | 'monthlyPRsReviewed' | 'monthlyIssuesClosed' | 'dailyCommits' | 'dailyIssuesClosed'>, delta?: number) => void;
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
  checkMonthlyReset: () => void;
  persist: () => void;
  hydrate: () => void;
  loadServerState: (data: Record<string, unknown>) => void;
  applyServerFeed: (feedItem: FeedItem) => void;
  applyServerOverlay: (overlay: { type: string; payload: Record<string, unknown> }) => void;
  applyServerConfig: (config: { xpValues: Record<string, number>; levels: Array<{ level: number; xp: number; title: string }>; bossGoals?: BossGoal[] }) => void;
}

export const useStore = create<AppState>((set, get) => ({
  members: [],
  stats: {},
  feed: [],
  bossProgress: {},
  bossIndex: 0,
  bossGoals: CONFIG.bossGoals.map(goal => ({ ...goal })),
  previousRanks: {},
  belts: { reviewer: null, closer: null, speedKing: null },
  shamePRs: [],
  spotlightMode: 0,
  monthStartDate: monthStart(),
  dayStartDate: today(),
  isDemo: typeof CONFIG.pat === 'string' && CONFIG.pat.trim().length > 0,
  overlayQueue: [],
  lastSeason: null,
  ciAlerts: [],
  activeDays: {},

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
    s.monthlyXp += amount;
    s.totalXp += amount;
    console.log(`[GitArena] +${amount}xp ${login} (${type}) → ${s.monthlyXp}xp total`);
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
      s.monthlyXp += XP_VALUES.streakBonus;
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
    if (field === 'monthlyIssuesClosed' && s.monthlyIssuesClosed >= 10 && !s.badges.includes('ghostSlayer')) {
      get().awardBadge(login, 'ghostSlayer');
    }
    if (field === 'dailyIssuesClosed' && s.dailyIssuesClosed >= 5 && !s.badges.includes('closer')) {
      get().awardBadge(login, 'closer');
    }
  },

  addLines: (login, added, deleted) => {
    const stats = { ...get().stats };
    const s = { ...(stats[login] || emptyStats(login)) };
    s.monthlyLinesAdded += added;
    s.monthlyLinesDeleted += deleted;
    stats[login] = s;
    set({ stats });
  },

  setBossProgress: (metric, value) => {
    const bp = { ...get().bossProgress, [metric]: value };
    const goals = get().bossGoals;
    const overlayQueue = [...get().overlayQueue];
    let bossIndex = get().bossIndex;
    while (goals[bossIndex] && (bp[goals[bossIndex].metric] || 0) >= goals[bossIndex].target) {
      overlayQueue.push({ type: 'boss-victory', payload: { bossIndex } });
      bossIndex++;
    }
    set({ bossProgress: bp, bossIndex, overlayQueue });
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
      if (d.xp > s.monthlyXp) {
        s.monthlyXp = d.xp;
        s.totalXp = d.xp;
      }
      if (d.commits > s.monthlyCommits) s.monthlyCommits = d.commits;
      if (d.prOpens > s.monthlyPRsOpened) s.monthlyPRsOpened = d.prOpens;
      if (d.prMerges > s.monthlyPRsMerged) s.monthlyPRsMerged = d.prMerges;
      if (d.issueCloses > s.monthlyIssuesClosed) s.monthlyIssuesClosed = d.issueCloses;
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

  checkMonthlyReset: () => {
    const ms = monthStart();
    const day = today();
    if (day !== get().dayStartDate) {
      const stats = Object.fromEntries(Object.entries(get().stats).map(([login, value]) => [login, { ...value, dailyCommits: 0, dailyIssuesClosed: 0 }])) as Record<string, DevStats>;
      set({ stats, dayStartDate: day });
    }
    if (ms !== get().monthStartDate) {
      const stats = { ...get().stats };
      for (const login of Object.keys(stats)) {
        const s = { ...stats[login] };
        s.monthlyXp = 0;
        s.monthlyCommits = 0;
        s.monthlyPRsOpened = 0;
        s.monthlyPRsMerged = 0;
        s.monthlyPRsReviewed = 0;
        s.monthlyIssuesClosed = 0;
        s.monthlyIssuesOpened = 0;
        s.monthlyLinesAdded = 0;
        s.monthlyLinesDeleted = 0;
        s.dailyCommits = 0;
        s.dailyIssuesClosed = 0;
        stats[login] = s;
      }
      set({ stats, monthStartDate: ms, dayStartDate: day, bossProgress: {}, bossIndex: 0, previousRanks: {} });
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
      monthStart: s.monthStartDate,
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
      monthStartDate: saved.monthStart,
      feed: (saved.feed || []) as FeedItem[],
    });
  },

  // ── Server-authoritative state ─────────────────
  loadServerState: (data: Record<string, unknown>) => {
    const d = data as {
      members?: Member[];
      stats?: Record<string, DevStats>;
      feed?: FeedItem[];
      bossProgress?: Record<string, number>;
      bossIndex?: number;
      previousRanks?: Record<string, number>;
      belts?: Belts;
      shamePRs?: ShamePR[];
      monthStartDate?: string;
      lastSeason?: SeasonRecap | null;
      ciAlerts?: CiAlert[];
      activeDays?: Record<string, number>;
      xpConfig?: { xpValues: Record<string, number>; levels: Array<{ level: number; xp: number; title: string }>; bossGoals?: BossGoal[] };
    };
    const update: Partial<AppState> = {};
    if (d.members) update.members = d.members;
    if (d.stats) update.stats = d.stats;
    if (d.feed) update.feed = d.feed;
    if (d.bossProgress) update.bossProgress = d.bossProgress;
    if (d.bossIndex !== undefined) update.bossIndex = d.bossIndex;
    if (d.previousRanks) update.previousRanks = d.previousRanks;
    if (d.belts) update.belts = d.belts;
    if (d.shamePRs) update.shamePRs = d.shamePRs;
    if (d.monthStartDate) update.monthStartDate = d.monthStartDate;
    if (d.lastSeason !== undefined) update.lastSeason = d.lastSeason;
    if (d.ciAlerts) update.ciAlerts = d.ciAlerts;
    if (d.activeDays) update.activeDays = d.activeDays;
    if (d.xpConfig) {
      updateXpConfig(d.xpConfig);
      if (d.xpConfig.bossGoals) update.bossGoals = d.xpConfig.bossGoals;
    }
    set(update);
  },

  applyServerFeed: (feedItem: FeedItem) => {
    const existing = get().feed;
    if (existing.some(f => f.id === feedItem.id)) return;
    const feed = [feedItem, ...existing]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 50);
    set({ feed });
  },

  applyServerOverlay: (overlay: { type: string; payload: Record<string, unknown> }) => {
    const overlayQueue = [...get().overlayQueue];
    if (overlayQueue.length < 5) {
      overlayQueue.push(overlay);
      set({ overlayQueue });
    }
  },

  applyServerConfig: (config: { xpValues: Record<string, number>; levels: Array<{ level: number; xp: number; title: string }>; bossGoals?: BossGoal[] }) => {
    updateXpConfig(config);
    if (config.bossGoals) set({ bossGoals: config.bossGoals });
  },
}));

// Expose debug tool on window for testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__gitarena = {
    getState: () => useStore.getState(),
    getStats: () => useStore.getState().stats,
    getRanking: () => rankedLogins(useStore.getState().stats).map((login, i) => {
      const s = useStore.getState().stats[login];
      return `#${i + 1} ${login}: ${s?.monthlyXp || 0} XP`;
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
    .sort((a, b) => b.monthlyXp - a.monthlyXp)
    .map((s) => s.login);
}
