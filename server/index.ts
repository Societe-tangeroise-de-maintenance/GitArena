import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Paths ────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'xp-config.json');
const STATE_PATH = path.join(__dirname, '..', 'server-state.json');
const ENV_PATH = path.join(__dirname, '..', '.env');

// ── Load .env file ───────────────────────────────
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ── Types ────────────────────────────────────────
interface XpConfig {
  xpValues: Record<string, number>;
  levels: Array<{ level: number; xp: number; title: string }>;
  streakMilestones: number[];
  maxCommitsPerPush: number;
  bossGoals: Array<{ label: string; metric: string; target: number }>;
  pollIntervalSeconds: number;
  fullSyncIntervalSeconds: number;
}

interface DevStats {
  login: string;
  weeklyXp: number;
  totalXp: number;
  weeklyCommits: number;
  weeklyPRsOpened: number;
  weeklyPRsMerged: number;
  weeklyPRsReviewed: number;
  weeklyIssuesClosed: number;
  weeklyLinesAdded: number;
  weeklyLinesDeleted: number;
  dailyCommits: number;
  dailyIssuesClosed: number;
  streak: number;
  longestStreak: number;
  streakLastDate: string | null;
  lastActivityTime: string | null;
  lastCommitDate: string | null;
  badges: string[];
}

interface Member {
  login: string;
  name: string;
  color: string;
  avatarUrl: string;
}

interface FeedItem {
  id: string;
  type: string;
  user: string;
  repo: string;
  message: string;
  detail: string;
  xp: number;
  time: string;
}

interface ServerState {
  members: Member[];
  stats: Record<string, DevStats>;
  feed: FeedItem[];
  bossProgress: Record<string, number>;
  bossIndex: number;
  previousRanks: Record<string, number>;
  belts: { reviewer: string | null; closer: string | null; speedKing: string | null };
  shamePRs: Array<{ title: string; repo: string; author: string; age: number }>;
  weekStartDate: string;
  seenIds: string[];
  etags: Record<string, string>;
  repos: string[];
}

// ── GitHub config ────────────────────────────────
const GH_PAT = process.env.GITARENA_PAT || '';
const GH_ORG = process.env.GITARENA_ORG || '';
const GH_REPOS = (process.env.GITARENA_REPOS || '').split(',').filter(Boolean);
const PORT = parseInt(process.env.PORT || '3002', 10);
const BASE = 'https://api.github.com';

if (!GH_PAT || !GH_ORG) {
  console.error('GITARENA_PAT and GITARENA_ORG environment variables are required');
  process.exit(1);
}

// ── Config hot-reload ────────────────────────────
let xpConfig: XpConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
let configMtime = fs.statSync(CONFIG_PATH).mtimeMs;

function reloadConfigIfChanged(): void {
  try {
    const mtime = fs.statSync(CONFIG_PATH).mtimeMs;
    if (mtime !== configMtime) {
      xpConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      configMtime = mtime;
      console.log('[server] XP config reloaded');
    }
  } catch { /* keep old config */ }
}

// ── State ────────────────────────────────────────
const COLORS = ['#3b82f6', '#a78bfa', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

function emptyStats(login: string): DevStats {
  return {
    login, weeklyXp: 0, totalXp: 0,
    weeklyCommits: 0, weeklyPRsOpened: 0, weeklyPRsMerged: 0,
    weeklyPRsReviewed: 0, weeklyIssuesClosed: 0,
    weeklyLinesAdded: 0, weeklyLinesDeleted: 0,
    dailyCommits: 0, dailyIssuesClosed: 0,
    streak: 0, longestStreak: 0, streakLastDate: null,
    lastActivityTime: null, lastCommitDate: null, badges: [],
  };
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

const BOT_LOGINS = new Set(['coderabbitai', 'copilot', 'dependabot[bot]', 'github-actions[bot]', 'renovate[bot]', 'codecov[bot]']);
function isBot(login: string): boolean {
  return BOT_LOGINS.has(login) || login.endsWith('[bot]') || login.endsWith('-bot');
}

function loadServerState(): ServerState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch { /* corrupted file, start fresh */ }
  return {
    members: [], stats: {}, feed: [],
    bossProgress: {}, bossIndex: 0, previousRanks: {},
    belts: { reviewer: null, closer: null, speedKing: null },
    shamePRs: [], weekStartDate: monthStart(),
    seenIds: [], etags: {}, repos: [],
  };
}

let state: ServerState = loadServerState();
const seenIds = new Set<string>(state.seenIds || []);

function persistState(): void {
  // Keep seenIds manageable
  if (seenIds.size > 5000) {
    const arr = [...seenIds];
    seenIds.clear();
    for (const id of arr.slice(-3000)) seenIds.add(id);
  }
  state.seenIds = [...seenIds];
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state), 'utf-8');
  } catch (err) {
    console.warn('[server] Failed to persist state:', err);
  }
}

// ── SSE clients ──────────────────────────────────
type SseClient = { id: number; res: express.Response };
let sseClientId = 0;
const sseClients: SseClient[] = [];

function broadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].res.write(msg);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// ── GitHub fetch helpers ────────────────────────
function ghHeaders(etag?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GH_PAT}`,
  };
  if (etag) h['If-None-Match'] = etag;
  return h;
}

async function ghFetch(url: string, etag?: string): Promise<{ data: unknown; etag?: string; notModified: boolean; ok: boolean }> {
  const res = await fetch(url, { headers: ghHeaders(etag) });
  if (res.status === 304) return { data: null, etag, notModified: true, ok: true };
  if (!res.ok) {
    console.warn(`[gh] ${res.status} ${url.split('?')[0]}`);
    return { data: null, etag, notModified: false, ok: false };
  }
  const data = await res.json();
  const newEtag = res.headers.get('ETag') || etag;
  return { data, etag: newEtag, notModified: false, ok: true };
}

// ── Core XP logic ────────────────────────────────
function getLevel(totalXp: number) {
  let current = xpConfig.levels[0];
  for (const l of xpConfig.levels) {
    if (totalXp >= l.xp) current = l;
    else break;
  }
  return current;
}

function rankedLogins(): string[] {
  return Object.values(state.stats)
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .map(s => s.login);
}

function ensureMember(login: string, avatarUrl?: string): void {
  if (isBot(login)) return;
  const existing = state.members.find(m => m.login === login);
  if (existing) {
    if (avatarUrl && !existing.avatarUrl) existing.avatarUrl = avatarUrl;
    return;
  }
  const color = COLORS[state.members.length % COLORS.length];
  state.members.push({ login, name: login, color, avatarUrl: avatarUrl || '' });
  if (!state.stats[login]) state.stats[login] = emptyStats(login);
}

function addXp(login: string, amount: number, type: string, repo: string, message: string, detail?: string, eventTime?: string): void {
  if (isBot(login)) return;
  ensureMember(login);
  const s = state.stats[login] || emptyStats(login);
  const oldLevel = getLevel(s.totalXp).level;
  s.weeklyXp += amount;
  s.totalXp += amount;
  s.lastActivityTime = eventTime || new Date().toISOString();
  state.stats[login] = s;

  const feedItem: FeedItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type, user: login, repo, message,
    detail: detail || '', xp: amount,
    time: eventTime || new Date().toISOString(),
  };
  state.feed = [feedItem, ...state.feed]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 50);

  const newLevel = getLevel(s.totalXp).level;

  // Check level-up
  if (newLevel > oldLevel) {
    broadcast('overlay', { type: 'level-up', payload: { login, level: newLevel, title: getLevel(s.totalXp).title } });
  }

  // Check rank overtaken
  const ranked = rankedLogins();
  const newRank = ranked.indexOf(login) + 1;
  const oldRank = state.previousRanks[login] || newRank;
  if (newRank < oldRank && oldRank > 1) {
    broadcast('overlay', { type: 'overtaken', payload: { login, newRank, oldRank } });
  }
  const newPreviousRanks: Record<string, number> = {};
  ranked.forEach((l, i) => { newPreviousRanks[l] = i + 1; });
  state.previousRanks = newPreviousRanks;

  // Broadcast new feed item to all clients
  broadcast('feed', feedItem);
}

function incrementStat(login: string, field: string, delta = 1): void {
  const s = state.stats[login];
  if (!s) return;
  (s as unknown as Record<string, unknown>)[field] = ((s as unknown as Record<string, unknown>)[field] as number || 0) + delta;

  // Auto-detect count-based badges
  if (field === 'weeklyIssuesClosed' && s.weeklyIssuesClosed >= 10 && !s.badges.includes('ghostSlayer')) {
    awardBadge(login, 'ghostSlayer');
  }
  if (field === 'dailyIssuesClosed' && s.dailyIssuesClosed >= 5 && !s.badges.includes('closer')) {
    awardBadge(login, 'closer');
  }
}

function awardBadge(login: string, badgeId: string): void {
  const s = state.stats[login];
  if (!s || s.badges.includes(badgeId)) return;
  s.badges.push(badgeId);
  broadcast('overlay', { type: 'achievement', payload: { login, badgeId } });
}

function bumpStreak(login: string): void {
  const s = state.stats[login];
  if (!s) return;
  const d = todayStr();
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

  if (xpConfig.streakMilestones.includes(s.streak)) {
    s.weeklyXp += xpConfig.xpValues.streakBonus;
    s.totalXp += xpConfig.xpValues.streakBonus;
  }

  if (s.streak >= 30 && !s.badges.includes('ironDev')) awardBadge(login, 'ironDev');
  else if (s.streak >= 7 && !s.badges.includes('streakMaster')) awardBadge(login, 'streakMaster');
}

function addLineStats(login: string, added: number, deleted: number): void {
  const s = state.stats[login];
  if (!s) return;
  s.weeklyLinesAdded += added;
  s.weeklyLinesDeleted += deleted;
}

async function fetchPushLineStats(login: string, repo: string, before: string, head: string): Promise<void> {
  try {
    const url = `${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/compare/${before}...${head}`;
    const { data, ok } = await ghFetch(url);
    if (!ok || !data) return;
    const d = data as Record<string, unknown>;
    const files = d.files as Array<Record<string, unknown>> | undefined;
    if (!files) return;
    let added = 0;
    let deleted = 0;
    for (const f of files) {
      added += (f.additions as number) || 0;
      deleted += (f.deletions as number) || 0;
    }
    if (added || deleted) {
      addLineStats(login, added, deleted);
      broadcast('state', getClientState());
    }
  } catch { /* non-critical, skip */ }
}

// ── Monthly reset check ──────────────────────────
function checkMonthlyReset(): void {
  const ms = monthStart();
  if (ms !== state.weekStartDate) {
    console.log(`[server] Monthly reset: ${state.weekStartDate} → ${ms}`);
    for (const login of Object.keys(state.stats)) {
      const s = state.stats[login];
      s.weeklyXp = 0; s.weeklyCommits = 0; s.weeklyPRsOpened = 0;
      s.weeklyPRsMerged = 0; s.weeklyPRsReviewed = 0; s.weeklyIssuesClosed = 0;
      s.weeklyLinesAdded = 0; s.weeklyLinesDeleted = 0;
      s.dailyCommits = 0; s.dailyIssuesClosed = 0;
    }
    state.weekStartDate = ms;
    state.bossProgress = {};
    state.previousRanks = {};
    seenIds.clear();
    broadcast('reset', {});
  }
}

// ── GitHub polling ───────────────────────────────
function processEvent(event: Record<string, unknown>): void {
  const xp = xpConfig.xpValues;
  const actorObj = event.actor as Record<string, string>;
  const actor = actorObj?.login;
  const avatarUrl = actorObj?.avatar_url || '';
  const repo = ((event.repo as Record<string, string>)?.name || '').split('/').pop() || '';
  const type = event.type as string;
  const payload = event.payload as Record<string, unknown>;
  const eventTime = (event.created_at as string) || undefined;

  if (!actor || isBot(actor)) return;
  if (eventTime && eventTime < monthStart()) return;

  ensureMember(actor, avatarUrl);

  switch (type) {
    case 'PushEvent': {
      const commits = (payload.commits as Array<Record<string, string>>) || [];
      const count = commits.length;
      const cappedCount = Math.min(count, xpConfig.maxCommitsPerPush);
      if (count > 0) {
        const msg = commits[0]?.message?.split('\n')[0] || 'pushed code';
        addXp(actor, xp.commit * cappedCount, 'commit', repo, `pushed ${count} commit${count > 1 ? 's' : ''}`, msg, eventTime);
        incrementStat(actor, 'weeklyCommits', cappedCount);
        incrementStat(actor, 'dailyCommits', cappedCount);
        bumpStreak(actor);
        // Fetch line stats via compare API
        const before = payload.before as string;
        const head = payload.head as string;
        if (before && head && repo) {
          fetchPushLineStats(actor, repo, before, head).catch(() => {});
        }
      } else {
        addXp(actor, xp.commit, 'commit', repo, 'pushed code', undefined, eventTime);
        incrementStat(actor, 'weeklyCommits', 1);
        incrementStat(actor, 'dailyCommits', 1);
        bumpStreak(actor);
      }
      break;
    }
    case 'CreateEvent': {
      const refType = payload.ref_type as string;
      if (refType === 'branch') {
        addXp(actor, xp.firstCommit, 'commit', repo, `created branch ${(payload.ref as string) || ''}`, undefined, eventTime);
      }
      break;
    }
    case 'PullRequestEvent': {
      const action = payload.action as string;
      const pr = payload.pull_request as Record<string, unknown>;
      const title = (pr?.title as string) || 'PR';
      const prNum = pr?.number as number;
      if (action === 'opened') {
        const key = `rt-pr-open-${repo}-${prNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, xp.prOpened, 'pr-opened', repo, 'opened PR', title, eventTime);
          incrementStat(actor, 'weeklyPRsOpened');
          const prAdd = (pr?.additions as number) || 0;
          const prDel = (pr?.deletions as number) || 0;
          if (prAdd || prDel) addLineStats(actor, prAdd, prDel);
        }
      } else if (action === 'closed' && pr?.merged) {
        const key = `rt-pr-merge-${repo}-${prNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, xp.prMerged, 'pr-merged', repo, 'merged PR', title, eventTime);
          incrementStat(actor, 'weeklyPRsMerged');
          const prAdd = (pr?.additions as number) || 0;
          const prDel = (pr?.deletions as number) || 0;
          if (prAdd || prDel) addLineStats(actor, prAdd, prDel);
        }
      }
      break;
    }
    case 'PullRequestReviewEvent': {
      const reviewPr = payload.pull_request as Record<string, unknown>;
      const reviewId = (payload.review as Record<string, unknown>)?.id || event.id;
      const key = `rt-review-${repo}-${reviewId}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        addXp(actor, xp.prReviewed, 'review', repo, 'reviewed PR', (reviewPr?.title as string) || '', eventTime);
        incrementStat(actor, 'weeklyPRsReviewed');
      }
      break;
    }
    case 'IssuesEvent': {
      const action = payload.action as string;
      const issue = payload.issue as Record<string, unknown>;
      const title = (issue?.title as string) || '';
      const issueNum = issue?.number as number;
      if (action === 'opened') {
        const key = `rt-issue-open-${repo}-${issueNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, xp.issueOpened, 'issue-opened', repo, 'opened issue', title, eventTime);
        }
      } else if (action === 'closed') {
        const key = `rt-issue-close-${repo}-${issueNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, xp.issueClosed, 'issue', repo, 'closed issue', title, eventTime);
          incrementStat(actor, 'weeklyIssuesClosed');
          incrementStat(actor, 'dailyIssuesClosed');
        }
      }
      break;
    }
  }
}

function processIssueOrPR(item: Record<string, unknown>, repo: string): void {
  const xp = xpConfig.xpValues;
  const user = item.user as Record<string, string> | undefined;
  const login = user?.login;
  const avatarUrl = user?.avatar_url || '';
  if (!login || isBot(login)) return;

  const isPR = !!item.pull_request;
  const itemState = item.state as string;
  const title = (item.title as string) || '';
  const createdAt = item.created_at as string;
  const closedAt = item.closed_at as string | null;
  const merged = isPR && !!(item.pull_request as Record<string, unknown>)?.merged_at;

  const ms = monthStart();
  const latestTime = closedAt || createdAt;
  if (latestTime && latestTime < ms) return;

  ensureMember(login, avatarUrl);

  if (isPR) {
    const openKey = `rt-pr-open-${repo}-${item.number}`;
    if (!seenIds.has(openKey)) {
      seenIds.add(openKey);
      addXp(login, xp.prOpened, 'pr-opened', repo, 'opened PR', title, createdAt);
      incrementStat(login, 'weeklyPRsOpened');
    }
    if (merged && closedAt) {
      const mergeKey = `rt-pr-merge-${repo}-${item.number}`;
      if (!seenIds.has(mergeKey)) {
        seenIds.add(mergeKey);
        addXp(login, xp.prMerged, 'pr-merged', repo, 'merged PR', title, closedAt);
        incrementStat(login, 'weeklyPRsMerged');
      }
    }
  } else {
    const openKey = `rt-issue-open-${repo}-${item.number}`;
    if (!seenIds.has(openKey)) {
      seenIds.add(openKey);
      addXp(login, xp.issueOpened, 'issue-opened', repo, 'opened issue', title, createdAt);
    }
    if (itemState === 'closed' && closedAt) {
      const closeKey = `rt-issue-close-${repo}-${item.number}`;
      if (!seenIds.has(closeKey)) {
        seenIds.add(closeKey);
        addXp(login, xp.issueClosed, 'issue', repo, 'closed issue', title, closedAt);
        incrementStat(login, 'weeklyIssuesClosed');
        incrementStat(login, 'dailyIssuesClosed');
      }
    }
  }
}

let reposFetched = false;
let polling = false;
let syncing = false;

async function pollEvents(): Promise<void> {
  if (polling || syncing) return;
  polling = true;
  try {
  reloadConfigIfChanged();
  checkMonthlyReset();

  // Fetch repos if needed (optional — org events cover all repos anyway)
  if (state.repos.length === 0 && !reposFetched) {
    reposFetched = true;
    if (GH_REPOS.length > 0) {
      state.repos = GH_REPOS;
    } else {
      const { data, ok } = await ghFetch(`${BASE}/orgs/${encodeURIComponent(GH_ORG)}/repos?per_page=100&sort=pushed`);
      if (ok && Array.isArray(data)) {
        state.repos = data.map((r: Record<string, string>) => r.name);
        console.log(`[server] Discovered ${state.repos.length} repos`);
      }
      // Not fatal — org events endpoint covers all repos
    }
  }

  let eventsProcessed = 0;

  // Org events
  try {
    const { data, etag, notModified } = await ghFetch(
      `${BASE}/orgs/${encodeURIComponent(GH_ORG)}/events?per_page=100`,
      state.etags['__org__'],
    );
    state.etags['__org__'] = etag || '';
    if (!notModified && Array.isArray(data)) {
      for (const event of data) {
        const id = event.id as string;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        processEvent(event);
        eventsProcessed++;
      }
    }
  } catch (err) { console.warn('[server] org events error:', err); }

  // Per-repo events + recent activity (parallel batches of 5)
  const reposToCheck = state.repos.slice(0, 20);
  const REPO_BATCH = 5;
  for (let i = 0; i < reposToCheck.length; i += REPO_BATCH) {
    const batch = reposToCheck.slice(i, i + REPO_BATCH);
    const batchBefore = eventsProcessed;

    await Promise.allSettled(batch.map(async (repo) => {
      try {
        const { data, etag, notModified } = await ghFetch(
          `${BASE}/repos/${encodeURIComponent(GH_ORG)}/${encodeURIComponent(repo)}/events?per_page=100`,
          state.etags[repo],
        );
        state.etags[repo] = etag || '';
        if (!notModified && Array.isArray(data)) {
          for (const event of data) {
            const id = event.id as string;
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            processEvent(event);
            eventsProcessed++;
          }
        }
      } catch { /* ignore */ }

      // Supplementary: recent issues/PRs
      try {
        const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data, ok } = await ghFetch(
          `${BASE}/repos/${encodeURIComponent(GH_ORG)}/${encodeURIComponent(repo)}/issues?state=all&sort=updated&direction=desc&since=${encodeURIComponent(since)}&per_page=30`,
        );
        if (ok && Array.isArray(data)) {
          for (const item of data) processIssueOrPR(item, repo);
        }
      } catch { /* ignore */ }
    }));

    // Broadcast after each batch so clients see updates incrementally
    if (eventsProcessed > batchBefore) {
      broadcast('state', getClientState());
    }
  }

  console.log(`[server] Poll: ${eventsProcessed} events, seenIds=${seenIds.size}`);

  // Broadcast state snapshot
  broadcast('state', getClientState());
  persistState();
  } finally {
    polling = false;
  }
}

async function fullSync(): Promise<void> {
  if (syncing || polling) return;
  syncing = true;
  try {
  reloadConfigIfChanged();
  const xp = xpConfig.xpValues;
  const ws = monthStart();

  try {
    // Parallel search queries
    const [commitResult, prCreatedResult, prMergedResult, issueClosedResult, issueOpenedResult] = await Promise.allSettled([
      ghFetch(`${BASE}/search/commits?q=${encodeURIComponent(`org:${GH_ORG} committer-date:>=${ws}`)}&per_page=100`),
      ghFetch(`${BASE}/search/issues?q=${encodeURIComponent(`org:${GH_ORG} type:pr created:>=${ws}`)}&per_page=100`),
      ghFetch(`${BASE}/search/issues?q=${encodeURIComponent(`org:${GH_ORG} type:pr is:merged merged:>=${ws}`)}&per_page=100`),
      ghFetch(`${BASE}/search/issues?q=${encodeURIComponent(`org:${GH_ORG} type:issue is:closed closed:>=${ws}`)}&per_page=100`),
      ghFetch(`${BASE}/search/issues?q=${encodeURIComponent(`org:${GH_ORG} type:issue created:>=${ws}`)}&per_page=100`),
    ]);

    // Commits
    const commitData = commitResult.status === 'fulfilled' ? commitResult.value.data : null;
    const commitItems = (commitData as Record<string, unknown>)?.items as unknown[] || [];
    const commitsByUser: Record<string, { count: number; avatarUrl: string; repos: Set<string>; lastMsg: string; lastTime: string }> = {};
    for (const c of commitItems) {
      const co = c as Record<string, unknown>;
      const login = (co.author as Record<string, string>)?.login || (co.committer as Record<string, string>)?.login;
      if (!login || isBot(login)) continue;
      const avatar = (co.author as Record<string, string>)?.avatar_url || '';
      const repo = (co.repository as Record<string, string>)?.name || '';
      const msg = ((co.commit as Record<string, unknown>)?.message as string || '');
      const time = ((co.commit as Record<string, unknown>)?.author as Record<string, string>)?.date || '';
      if (!commitsByUser[login]) commitsByUser[login] = { count: 0, avatarUrl: avatar, repos: new Set(), lastMsg: '', lastTime: '' };
      commitsByUser[login].count++;
      commitsByUser[login].repos.add(repo);
      if (time > commitsByUser[login].lastTime) {
        commitsByUser[login].lastMsg = msg.split('\n')[0];
        commitsByUser[login].lastTime = time;
      }
    }

    // PRs — merge created + merged queries, dedup by number
    const prCreatedData = prCreatedResult.status === 'fulfilled' ? prCreatedResult.value.data : null;
    const prMergedData = prMergedResult.status === 'fulfilled' ? prMergedResult.value.data : null;
    const prCreatedItems = (prCreatedData as Record<string, unknown>)?.items as unknown[] || [];
    const prMergedItems = (prMergedData as Record<string, unknown>)?.items as unknown[] || [];
    // Merge and deduplicate by PR number
    const prSeen = new Set<number>();
    const prAllItems: unknown[] = [];
    for (const pr of [...prCreatedItems, ...prMergedItems]) {
      const num = (pr as Record<string, unknown>).number as number;
      if (!prSeen.has(num)) { prSeen.add(num); prAllItems.push(pr); }
    }
    const prDataByUser: Record<string, { opens: number; merges: number; avatarUrl: string }> = {};
    const prFeedRaw: Array<{ login: string; title: string; repo: string; time: string; merged: boolean }> = [];
    const prDetailUrls: Array<{ login: string; url: string }> = [];
    for (const pr of prAllItems) {
      const p = pr as Record<string, unknown>;
      const login = (p.user as Record<string, string>)?.login;
      if (!login || isBot(login)) continue;
      const avatar = (p.user as Record<string, string>)?.avatar_url || '';
      const merged = !!(p.pull_request as Record<string, unknown>)?.merged_at;
      const repo = ((p.repository_url as string) || '').split('/').pop() || '';
      const title = (p.title as string) || '';
      const time = merged
        ? ((p.pull_request as Record<string, string>)?.merged_at || (p.created_at as string))
        : (p.created_at as string);
      if (!prDataByUser[login]) prDataByUser[login] = { opens: 0, merges: 0, avatarUrl: avatar };
      prDataByUser[login].opens++;
      if (merged) prDataByUser[login].merges++;
      prFeedRaw.push({ login, title, repo, time, merged });
      const prUrl = (p.pull_request as Record<string, string>)?.url;
      if (prUrl) prDetailUrls.push({ login, url: prUrl });
    }

    // Fetch PR details to get line stats (additions/deletions)
    const linesByUser: Record<string, { added: number; deleted: number }> = {};
    const BATCH_SIZE = 5;
    for (let i = 0; i < prDetailUrls.length; i += BATCH_SIZE) {
      const batch = prDetailUrls.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(({ url }) => ghFetch(url)));
      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        if (result.status !== 'fulfilled' || !result.value.ok || !result.value.data) continue;
        const prDetail = result.value.data as Record<string, unknown>;
        const adds = (prDetail.additions as number) || 0;
        const dels = (prDetail.deletions as number) || 0;
        const login = batch[j].login;
        if (!linesByUser[login]) linesByUser[login] = { added: 0, deleted: 0 };
        linesByUser[login].added += adds;
        linesByUser[login].deleted += dels;
      }
    }

    // Issues closed
    const issueData = issueClosedResult.status === 'fulfilled' ? issueClosedResult.value.data : null;
    const closedIssues = (issueData as Record<string, unknown>)?.items as unknown[] || [];
    const issuesClosedByUser: Record<string, { count: number; avatarUrl: string }> = {};
    const issueFeedRaw: Array<{ login: string; title: string; repo: string; time: string }> = [];
    for (const issue of closedIssues) {
      const iss = issue as Record<string, unknown>;
      const login = (iss.user as Record<string, string>)?.login;
      if (!login || isBot(login)) continue;
      const avatar = (iss.user as Record<string, string>)?.avatar_url || '';
      const repo = ((iss.repository_url as string) || '').split('/').pop() || '';
      const title = (iss.title as string) || '';
      const time = (iss.closed_at as string) || '';
      if (!issuesClosedByUser[login]) issuesClosedByUser[login] = { count: 0, avatarUrl: avatar };
      issuesClosedByUser[login].count++;
      issueFeedRaw.push({ login, title, repo, time });
    }

    // Issue opens for XP
    const issueOpenData = issueOpenedResult.status === 'fulfilled' ? issueOpenedResult.value.data : null;
    const openedIssues = (issueOpenData as Record<string, unknown>)?.items as unknown[] || [];
    const issuesOpenedByUser: Record<string, { count: number }> = {};
    for (const issue of openedIssues) {
      const iss = issue as Record<string, unknown>;
      const login = (iss.user as Record<string, string>)?.login;
      if (!login || isBot(login)) continue;
      if (!issuesOpenedByUser[login]) issuesOpenedByUser[login] = { count: 0 };
      issuesOpenedByUser[login].count++;
    }

    // Reviews (was missing from fullSync)
    // Note: Search API doesn't directly support review searches,
    // so we rely on the poller for review XP

    // Compute authoritative XP per user
    const allLogins = new Set([
      ...Object.keys(commitsByUser),
      ...Object.keys(prDataByUser),
      ...Object.keys(issuesClosedByUser),
      ...Object.keys(issuesOpenedByUser),
    ]);

    for (const login of allLogins) {
      const c = commitsByUser[login];
      const p = prDataByUser[login];
      const ic = issuesClosedByUser[login];
      const io = issuesOpenedByUser[login];
      const commits = c?.count || 0;
      const prOpens = p?.opens || 0;
      const prMerges = p?.merges || 0;
      const issueCloses = ic?.count || 0;
      const issueOpens = io?.count || 0;

      const searchXp =
        commits * xp.commit +
        prOpens * xp.prOpened +
        prMerges * xp.prMerged +
        issueCloses * xp.issueClosed +
        issueOpens * xp.issueOpened;

      const avatarUrl = c?.avatarUrl || p?.avatarUrl || ic?.avatarUrl || '';
      ensureMember(login, avatarUrl);
      const s = state.stats[login] || emptyStats(login);

      // Compute how much XP the poller already tracked for searchable categories
      const pollerSearchableXp =
        s.weeklyCommits * xp.commit +
        s.weeklyPRsOpened * xp.prOpened +
        s.weeklyPRsMerged * xp.prMerged +
        s.weeklyIssuesClosed * xp.issueClosed;
      // pollerExtraXp = XP from non-searchable sources (reviews, streaks, branches)
      const pollerExtraXp = Math.max(0, s.weeklyXp - pollerSearchableXp);

      // Only update if search found more searchable XP than poller tracked
      if (searchXp > pollerSearchableXp) {
        const newTotal = searchXp + pollerExtraXp;
        const delta = newTotal - s.weeklyXp;
        if (delta > 0) {
          s.weeklyXp = newTotal;
          s.totalXp += delta;
        }
      }
      if (commits > s.weeklyCommits) s.weeklyCommits = commits;
      if (prOpens > s.weeklyPRsOpened) s.weeklyPRsOpened = prOpens;
      if (prMerges > s.weeklyPRsMerged) s.weeklyPRsMerged = prMerges;
      if (issueCloses > s.weeklyIssuesClosed) s.weeklyIssuesClosed = issueCloses;
      const lines = linesByUser[login];
      if (lines) {
        if (lines.added > s.weeklyLinesAdded) s.weeklyLinesAdded = lines.added;
        if (lines.deleted > s.weeklyLinesDeleted) s.weeklyLinesDeleted = lines.deleted;
      }
      state.stats[login] = s;
    }

    // Generate feed items from search results
    const newFeedItems: FeedItem[] = [];
    const existingIds = new Set(state.feed.map(f => f.id));

    for (const login of allLogins) {
      const c = commitsByUser[login];
      if (c && c.lastMsg) {
        const id = `sync-commit-${login}`;
        if (!existingIds.has(id)) {
          newFeedItems.push({
            id,
            type: 'commit',
            user: login,
            repo: [...c.repos][0] || '',
            message: `pushed ${c.count} commit${c.count > 1 ? 's' : ''}`,
            detail: c.lastMsg,
            xp: c.count * xp.commit,
            time: c.lastTime,
          });
          existingIds.add(id);
        }
      }
    }

    for (const item of prFeedRaw) {
      const id = `sync-pr-${item.repo}-${item.title.slice(0, 20)}`;
      if (!existingIds.has(id)) {
        newFeedItems.push({
          id,
          type: item.merged ? 'pr-merged' : 'pr-opened',
          user: item.login,
          repo: item.repo,
          message: item.merged ? 'merged PR' : 'opened PR',
          detail: item.title,
          xp: item.merged ? xp.prMerged : xp.prOpened,
          time: item.time,
        });
        existingIds.add(id);
      }
    }

    for (const item of issueFeedRaw) {
      const id = `sync-issue-${item.repo}-${item.title.slice(0, 20)}`;
      if (!existingIds.has(id)) {
        newFeedItems.push({
          id,
          type: 'issue',
          user: item.login,
          repo: item.repo,
          message: 'closed issue',
          detail: item.title,
          xp: xp.issueClosed,
          time: item.time,
        });
        existingIds.add(id);
      }
    }

    // Merge and keep latest 50
    state.feed = [...newFeedItems, ...state.feed]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 50);

    // Boss progress
    const totalMerged = Object.values(prDataByUser).reduce((a, p) => a + p.merges, 0);
    state.bossProgress.prsMerged = totalMerged;
    state.bossProgress.issuesClosed = closedIssues.length;
    const searchCommitTotal = Object.values(commitsByUser).reduce((a, c) => a + c.count, 0);
    const statsCommitTotal = Object.values(state.stats).reduce((a, s) => a + s.weeklyCommits, 0);
    state.bossProgress.commits = Math.max(searchCommitTotal, statsCommitTotal);

    // Check boss victory
    const goal = xpConfig.bossGoals[state.bossIndex];
    if (goal) {
      const allMet = xpConfig.bossGoals.every(g => (state.bossProgress[g.metric] || 0) >= g.target);
      if (allMet) {
        broadcast('overlay', { type: 'boss-victory', payload: { bossIndex: state.bossIndex } });
        state.bossIndex++;
        state.bossProgress = {};
      }
    }

    // Shame PRs + org members in parallel
    const [shameResult, membersResult] = await Promise.allSettled([
      ghFetch(`${BASE}/search/issues?q=${encodeURIComponent(`org:${GH_ORG} type:pr is:open review:none`)}&per_page=100`),
      ghFetch(`${BASE}/orgs/${encodeURIComponent(GH_ORG)}/members?per_page=100`),
    ]);

    if (shameResult.status === 'fulfilled' && shameResult.value.ok) {
      const shamePRsRaw = (shameResult.value.data as Record<string, unknown>)?.items as unknown[] || [];
      state.shamePRs = shamePRsRaw.map((pr: unknown) => {
        const p = pr as Record<string, unknown>;
        return {
          title: (p.title as string) || '',
          repo: ((p.repository_url as string) || '').split('/').pop() || '',
          author: ((p.user as Record<string, string>)?.login) || '',
          age: Math.round((Date.now() - new Date(p.created_at as string).getTime()) / 3_600_000),
        };
      });
    }

    // Belts
    const allStats = Object.values(state.stats);
    if (allStats.length > 0) {
      const reviewer = allStats.reduce((best, s) =>
        s.weeklyPRsReviewed > (best?.weeklyPRsReviewed || 0) ? s : best, allStats[0]);
      const closer = allStats.reduce((best, s) =>
        s.weeklyIssuesClosed > (best?.weeklyIssuesClosed || 0) ? s : best, allStats[0]);
      const speed = allStats.reduce((best, s) =>
        s.weeklyPRsMerged > (best?.weeklyPRsMerged || 0) ? s : best, allStats[0]);
      state.belts = {
        reviewer: reviewer?.login || null,
        closer: closer?.login || null,
        speedKing: speed?.login || null,
      };
    }

    // Apply org members from parallel result
    if (membersResult.status === 'fulfilled' && membersResult.value.ok && Array.isArray(membersResult.value.data)) {
      for (const m of membersResult.value.data as Array<Record<string, string>>) {
        if (!isBot(m.login)) ensureMember(m.login, m.avatar_url || '');
      }
    }

    console.log(`[server] Full sync done: ${allLogins.size} users`);
  } catch (err) {
    console.warn('[server] Full sync failed:', err);
  }

  broadcast('state', getClientState());
  persistState();
  } finally {
    syncing = false;
  }
}

// ── Client-facing state ──────────────────────────
function getClientState() {
  return {
    members: state.members,
    stats: state.stats,
    feed: state.feed,
    bossProgress: state.bossProgress,
    bossIndex: state.bossIndex,
    previousRanks: state.previousRanks,
    belts: state.belts,
    shamePRs: state.shamePRs,
    weekStartDate: state.weekStartDate,
    xpConfig,
  };
}

// ── Express server ───────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Full state snapshot
app.get('/api/state', (_req, res) => {
  res.json(getClientState());
});

// XP config (read)
app.get('/api/config', (_req, res) => {
  reloadConfigIfChanged();
  res.json(xpConfig);
});

// XP config (update)
app.put('/api/config', (req, res) => {
  try {
    const newConfig = req.body as XpConfig;
    // Basic validation
    if (!newConfig.xpValues || !newConfig.levels) {
      res.status(400).json({ error: 'Missing xpValues or levels' });
      return;
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    xpConfig = newConfig;
    configMtime = fs.statSync(CONFIG_PATH).mtimeMs;
    broadcast('config', xpConfig);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Force recalculate (wipe state and re-sync)
app.post('/api/recalculate', async (_req, res) => {
  console.log('[server] Force recalculate requested');
  // Preserve members (avatars, colors) but reset XP
  for (const login of Object.keys(state.stats)) {
    state.stats[login] = emptyStats(login);
  }
  state.feed = [];
  state.bossProgress = {};
  state.previousRanks = {};
  seenIds.clear();
  await fullSync();
  res.json(getClientState());
});

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const clientId = ++sseClientId;
  const client: SseClient = { id: clientId, res };
  sseClients.push(client);
  console.log(`[server] SSE client ${clientId} connected (total: ${sseClients.length})`);

  req.on('close', () => {
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx >= 0) sseClients.splice(idx, 1);
    console.log(`[server] SSE client ${clientId} disconnected (total: ${sseClients.length})`);
  });
});

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, clients: sseClients.length, seenIds: seenIds.size, repos: state.repos.length });
});

// ── Start ────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] GitArena backend running on http://0.0.0.0:${PORT}`);
  console.log(`[server] Org: ${GH_ORG}, repos config: ${GH_REPOS.length > 0 ? GH_REPOS.join(', ') : 'auto-discover'}`);

  // Initial full sync then start polling
  fullSync().then(() => {
    pollEvents();
    setInterval(pollEvents, xpConfig.pollIntervalSeconds * 1000);
    setInterval(fullSync, xpConfig.fullSyncIntervalSeconds * 1000);
    setInterval(persistState, 30_000); // persist every 30s
  });
});
