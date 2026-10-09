import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { DEFAULT_SCORING, allocateXp, scoreDiff, type ChangedFile, type ScoringConfig } from './scoring.js';

// ── Paths ────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'xp-config.json');
const LEGACY_STATE_PATH = path.join(__dirname, '..', 'server-state.json');
const DATA_DIR = process.env.GITARENA_DATA_DIR || (process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '..', 'data')
  : path.join(__dirname, '..'));
const STATE_PATH = path.join(DATA_DIR, 'server-state.json');
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
  scoring?: ScoringConfig;
  legacyXpValues?: { commit: number; prOpened: number; prMerged: number };
  levels: Array<{ level: number; xp: number; title: string }>;
  streakMilestones: number[];
  bossGoals: Array<{ label: string; metric: string; target: number }>;
  pollIntervalSeconds: number;
  fullSyncIntervalSeconds: number;
}

interface DevStats {
  login: string;
  monthlyXp: number;
  totalXp: number;
  monthlyCommits: number;
  monthlyPRsOpened: number;
  monthlyPRsMerged: number;
  monthlyPRsReviewed: number;
  monthlyIssuesClosed: number;
  monthlyIssuesOpened: number;
  monthlyLinesAdded: number;
  monthlyLinesDeleted: number;
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
  monthStartDate: string;
  seenIds: string[];
  creditedCommitShas?: string[];
  processedPushIds?: string[];
  pushReplayDoneRepos?: string[];
  repoPushedAt?: Record<string, string>;
  branchHeads?: Record<string, string>;
  commitLedgerSeeded?: boolean;
  dailyStartDate?: string;
  etags: Record<string, string>;
  repos: string[];
  scoringVersion?: number;
  scoringEpoch?: string;
  scoringHash?: string;
  scoreLedger?: Record<string, ScoreLedgerEntry>;
  commitDiffCache?: Record<string, DiffCacheEntry>;
  prDiffCache?: Record<string, DiffCacheEntry>;
  commitPrCache?: Record<string, boolean>;
  defaultBranches?: Record<string, string>;
  lastSeason?: SeasonRecap;
  promotionRescoreMonth?: string;
  ciStatus?: Record<string, CiStatus>;
}

/** Latest CI result per repo branch; a failing one is a "planted spike" on the TV. */
interface CiStatus {
  repo: string;
  branch: string;
  failing: boolean;
  workflow: string;
  url: string;
  since: string;
  actor?: string;
}

/** Final standings of the previous month, kept for the TV's season recap. */
interface SeasonRecap {
  month: string;
  teamXp: number;
  standings: Array<{ login: string; xp: number; commits: number; merges: number; reviews: number; streak: number }>;
}

function snapshotSeason(): SeasonRecap {
  const standings = Object.values(state.stats)
    .filter(s => s.monthlyXp > 0)
    .sort((a, b) => b.monthlyXp - a.monthlyXp)
    .map(s => ({ login: s.login, xp: s.monthlyXp, commits: s.monthlyCommits, merges: s.monthlyPRsMerged, reviews: s.monthlyPRsReviewed, streak: s.longestStreak || s.streak }));
  return { month: state.monthStartDate, teamXp: standings.reduce((n, s) => n + s.xp, 0), standings };
}

interface ScoreAward {
  login: string;
  month: string;
  amount: number;
  kind: 'code' | 'pr-opened' | 'pr-merged';
  time: string;
}

interface ScoreLedgerEntry {
  key: string;
  repo: string;
  title: string;
  awards: Record<string, ScoreAward>;
  lineAwards: Record<string, { login: string; month: string; added: number; deleted: number }>;
  added: number;
  deleted: number;
  fileCount: number;
  updatedAt: string;
}

interface DiffCacheEntry {
  added: number;
  deleted: number;
  fileCount: number;
  codeXp: number;
  openXp: number;
  mergeXp: number;
  login?: string;
  time?: string;
  title?: string;
  parents?: number;
}

// ── GitHub config ────────────────────────────────
const GH_PAT = process.env.GITARENA_PAT || '';
const GH_ORG = process.env.GITARENA_ORG || '';
const GH_REPOS = (process.env.GITARENA_REPOS || '').split(',').filter(Boolean);
// Branches besides each repo's default branch where direct pushes earn code XP.
const EXTRA_SCORING_BRANCHES = (process.env.GITARENA_SCORING_BRANCHES ?? 'staging').split(',').map(b => b.trim()).filter(Boolean);
const PORT = parseInt(process.env.PORT || '3002', 10);
const ADMIN_SECRET = process.env.GITARENA_ADMIN_SECRET || '';
const BASE = 'https://api.github.com';
const DEMO_MODE = GH_PAT === 'demo';

if (!DEMO_MODE && (!GH_PAT || !GH_ORG)) {
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
    login, monthlyXp: 0, totalXp: 0,
    monthlyCommits: 0, monthlyPRsOpened: 0, monthlyPRsMerged: 0,
    monthlyPRsReviewed: 0, monthlyIssuesClosed: 0, monthlyIssuesOpened: 0,
    monthlyLinesAdded: 0, monthlyLinesDeleted: 0,
    dailyCommits: 0, dailyIssuesClosed: 0,
    streak: 0, longestStreak: 0, streakLastDate: null,
    lastActivityTime: null, lastCommitDate: null, badges: [],
  };
}

function monthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

const BOT_LOGINS = new Set(['coderabbitai', 'copilot', 'dependabot[bot]', 'github-actions[bot]', 'renovate[bot]', 'codecov[bot]']);
function isBot(login: string): boolean {
  if (!login) return false;
  const lower = login.toLowerCase();
  return BOT_LOGINS.has(lower) || lower.endsWith('[bot]') || lower.endsWith('-bot');
}

function loadServerState(): ServerState {
  try {
    const source = fs.existsSync(STATE_PATH) ? STATE_PATH : LEGACY_STATE_PATH;
    if (fs.existsSync(source)) {
      const loaded = JSON.parse(fs.readFileSync(source, 'utf-8')) as ServerState & { weekStartDate?: string };
      // Existing weekly totals are a valid partial count for their month.
      // Keep them as the monthly baseline so the first full sync only adds
      // earlier activity that was not already included in total XP.
      if (!loaded.monthStartDate) {
        loaded.monthStartDate = loaded.weekStartDate?.slice(0, 7) === monthStart().slice(0, 7)
          ? monthStart()
          : loaded.weekStartDate || monthStart();
      }
      const names = ['Xp', 'Commits', 'PRsOpened', 'PRsMerged', 'PRsReviewed', 'IssuesClosed', 'IssuesOpened', 'LinesAdded', 'LinesDeleted'];
      for (const stats of Object.values(loaded.stats || {})) {
        const row = stats as unknown as Record<string, unknown>;
        for (const name of names) {
          const current = `monthly${name}`, legacy = `weekly${name}`;
          if (row[current] === undefined) row[current] = row[legacy] ?? 0;
          delete row[legacy];
        }
      }
      delete loaded.weekStartDate;
      return loaded;
    }
  } catch { /* corrupted file, start fresh */ }
  return {
    members: [], stats: {}, feed: [],
    bossProgress: {}, bossIndex: 0, previousRanks: {},
    belts: { reviewer: null, closer: null, speedKing: null },
    shamePRs: [], monthStartDate: monthStart(),
    seenIds: [], creditedCommitShas: [], processedPushIds: [], pushReplayDoneRepos: [], repoPushedAt: {}, branchHeads: {}, commitLedgerSeeded: true, dailyStartDate: todayStr(), etags: {}, repos: [],
    scoringVersion: 2, scoringEpoch: monthStart(),
    scoreLedger: {}, commitDiffCache: {}, prDiffCache: {}, commitPrCache: {}, defaultBranches: {},
  };
}

let state: ServerState = loadServerState();
// Migration: ensure all loaded stats have new schema fields populated.
for (const s of Object.values(state.stats)) {
  if (typeof s.monthlyIssuesOpened !== 'number') s.monthlyIssuesOpened = 0;
}
const seenIds = new Set<string>(state.seenIds || []);
const creditedCommitShas = new Set<string>(state.creditedCommitShas || []);
const processedPushIds = new Set<string>(state.processedPushIds || []);
const pushReplayDoneRepos = new Set<string>(state.pushReplayDoneRepos || []);
const serverStartedAt = new Date().toISOString();
state.repoPushedAt ||= {};
state.ciStatus ||= {};
state.branchHeads ||= {};
state.scoreLedger ||= {};
state.commitDiffCache ||= {};
state.prDiffCache ||= {};
state.commitPrCache ||= {};
state.defaultBranches ||= {};

function scoringConfig(): ScoringConfig { return xpConfig.scoring || DEFAULT_SCORING; }
function eventXpValues(): Record<string, number> {
  return state.scoringVersion === 2 ? xpConfig.xpValues : { ...xpConfig.xpValues, ...xpConfig.legacyXpValues };
}
function awardMonth(time: string): string { return `${time.slice(0, 7)}-01`; }

function persistState(): void {
  // Keep action IDs for the whole month; only transient GitHub event IDs expire.
  const eventIds = [...seenIds].filter(id => !id.startsWith('rt-'));
  if (eventIds.length > 3000) for (const id of eventIds.slice(0, -3000)) seenIds.delete(id);
  state.seenIds = [...seenIds];
  state.creditedCommitShas = [...creditedCommitShas];
  if (processedPushIds.size > 5000) for (const id of [...processedPushIds].slice(0, processedPushIds.size - 5000)) processedPushIds.delete(id);
  state.processedPushIds = [...processedPushIds];
  state.pushReplayDoneRepos = [...pushReplayDoneRepos];
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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

const ghRateLimitedUntil: Record<'core' | 'search', number> = { core: 0, search: 0 };

async function ghFetch(url: string, etag?: string): Promise<{ data: unknown; etag?: string; notModified: boolean; ok: boolean }> {
  const resource = url.includes('/search/') ? 'search' : 'core';
  if (Date.now() < ghRateLimitedUntil[resource]) return { data: null, etag, notModified: false, ok: false };
  const res = await fetch(url, { headers: ghHeaders(etag) });
  if (res.status === 304) return { data: null, etag, notModified: true, ok: true };
  if (!res.ok) {
    const error = (res.status === 403 || res.status === 429) ? await res.json().catch(() => null) as { message?: string } | null : null;
    const limited = res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(error?.message || '');
    if (limited) {
      const resetAt = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      const until = Math.max(Date.now() + 60_000, Number.isFinite(resetAt) ? resetAt + 5_000 : 0, Number.isFinite(retryAfter) ? Date.now() + retryAfter : 0);
      if (until > ghRateLimitedUntil[resource]) {
        ghRateLimitedUntil[resource] = until;
        console.warn(`[gh] ${resource} rate limit reached; retry after ${new Date(until).toISOString()}`);
      }
    } else {
      console.warn(`[gh] ${res.status} ${url.split('?')[0]}`);
    }
    return { data: null, etag, notModified: false, ok: false };
  }
  const data = await res.json();
  const newEtag = res.headers.get('ETag') || etag;
  return { data, etag: newEtag, notModified: false, ok: true };
}

interface SearchResult { items: Array<Record<string, unknown>>; complete: boolean }
async function searchAll(kind: 'commits' | 'issues', baseQuery: string, dateField: string, from: string, to: string): Promise<SearchResult> {
  const query = `${baseQuery} ${dateField}:${from}..${to}`;
  const url = (page: number) => `${BASE}/search/${kind}?q=${encodeURIComponent(query)}&per_page=100&page=${page}`;
  const first = await ghFetch(url(1));
  if (!first.ok || !first.data) return { items: [], complete: false };
  const payload = first.data as Record<string, unknown>;
  const count = Number(payload.total_count || 0);
  if (count > 1000 || payload.incomplete_results === true) {
    if (from === to) {
      console.warn(`[server] Search result incomplete for ${kind} ${query}`);
      return { items: [], complete: false };
    }
    const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
    const middle = start + Math.floor((end - start) / (2 * 86400000)) * 86400000;
    const leftTo = new Date(middle).toISOString().slice(0, 10);
    const rightFrom = new Date(middle + 86400000).toISOString().slice(0, 10);
    const [left, right] = await Promise.all([searchAll(kind, baseQuery, dateField, from, leftTo), searchAll(kind, baseQuery, dateField, rightFrom, to)]);
    return { items: [...left.items, ...right.items], complete: left.complete && right.complete };
  }
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
  for (let page = 2; page <= Math.ceil(count / 100); page++) {
    const result = await ghFetch(url(page));
    const data = result.data as Record<string, unknown> | null;
    if (!result.ok || !data || !Array.isArray(data.items) || data.incomplete_results === true) return { items: [], complete: false };
    items.push(...data.items as Array<Record<string, unknown>>);
  }
  return { items, complete: items.length >= count };
}

function scoreConfigHash(): string {
  return createHash('sha256').update(JSON.stringify(scoringConfig())).digest('hex').slice(0, 12);
}
if (state.scoringVersion === 2 && !state.scoringHash && !Object.keys(state.scoreLedger || {}).length) state.scoringHash = scoreConfigHash();

async function ghList(url: string, maxPages = 30): Promise<Array<Record<string, unknown>> | null> {
  const items: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= maxPages; page++) {
    const separator = url.includes('?') ? '&' : '?';
    const result = await ghFetch(`${url}${separator}per_page=100&page=${page}`);
    if (!result.ok || !Array.isArray(result.data)) return null;
    const batch = result.data as Array<Record<string, unknown>>;
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  console.warn(`[server] GitHub list exceeded ${maxPages} pages: ${url}`);
  return null;
}

async function getPrDiff(repo: string, number: number, headSha: string): Promise<DiffCacheEntry | null> {
  const key = `${repo}#${number}:${headSha}:${scoreConfigHash()}`;
  if (state.prDiffCache?.[key]) return state.prDiffCache[key];
  const files = await ghList(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/pulls/${number}/files`);
  if (!files) return null;
  const diff = scoreDiff(files as ChangedFile[], scoringConfig());
  const entry = { added: diff.added, deleted: diff.deleted, fileCount: diff.fileCount, codeXp: diff.codeXp, openXp: diff.openXp, mergeXp: diff.mergeXp };
  state.prDiffCache![key] = entry;
  return entry;
}

async function getCommitDiff(repo: string, sha: string): Promise<DiffCacheEntry | null> {
  const key = `${repo}:${sha}:${scoreConfigHash()}`;
  if (state.commitDiffCache?.[key]) return state.commitDiffCache[key];
  const files: ChangedFile[] = [];
  let first: Record<string, unknown> | null = null;
  for (let page = 1; page <= 30; page++) {
    const result = await ghFetch(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/commits/${sha}?per_page=100&page=${page}`);
    if (!result.ok || !result.data) return null;
    const data = result.data as Record<string, unknown>;
    if (!first) first = data;
    const batch = data.files as ChangedFile[] | undefined;
    if (!Array.isArray(batch)) return null;
    files.push(...batch);
    if (batch.length < 100) break;
    if (page === 30) return null;
  }
  const diff = scoreDiff(files, scoringConfig());
  const commit = first?.commit as Record<string, unknown> | undefined;
  const author = commit?.author as Record<string, string> | undefined;
  const committer = commit?.committer as Record<string, string> | undefined;
  const entry: DiffCacheEntry = {
    added: diff.added, deleted: diff.deleted, fileCount: diff.fileCount,
    codeXp: diff.codeXp, openXp: diff.openXp, mergeXp: diff.mergeXp,
    login: (first?.author as Record<string, string> | undefined)?.login || (first?.committer as Record<string, string> | undefined)?.login,
    time: committer?.date || author?.date,
    title: ((commit?.message as string) || '').split('\n')[0],
    parents: Array.isArray(first?.parents) ? (first!.parents as unknown[]).length : undefined,
  };
  state.commitDiffCache![key] = entry;
  return entry;
}

function award(kind: ScoreAward['kind'], login: string, amount: number, time: string): ScoreAward {
  return { kind, login, amount, time, month: awardMonth(time) };
}

/** The default branch plus the configured extra scoring branches (e.g. staging). */
async function scoringBranches(repo: string): Promise<string[] | null> {
  const branch = await getDefaultBranch(repo);
  return branch ? [...new Set([branch, ...EXTRA_SCORING_BRANCHES])] : null;
}

/**
 * A PR between two scoring branches (e.g. staging -> main) only promotes
 * code that already earned XP on its way in, so it scores nothing itself.
 */
function isPromotionPr(pr: Record<string, unknown>, branches: string[]): boolean {
  const base = (pr.base as Record<string, string> | undefined)?.ref || '';
  const head = (pr.head as Record<string, string> | undefined)?.ref || '';
  return Boolean(base && head && base !== head && branches.includes(base) && branches.includes(head));
}

const branchExistsCache = new Map<string, { exists: boolean; at: number }>();
/** true / false when GitHub answered, undefined when it could not be checked. */
async function branchExists(repo: string, branch: string): Promise<boolean | undefined> {
  const key = `${repo}:${branch}`, hit = branchExistsCache.get(key);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.exists;
  if (Date.now() < ghRateLimitedUntil.core) return undefined;
  const res = await fetch(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`, { headers: ghHeaders() }).catch(() => null);
  if (!res || (res.status !== 404 && !res.ok)) return undefined;
  branchExistsCache.set(key, { exists: res.ok, at: Date.now() });
  return res.ok;
}

/** Scoring branches that exist in this repo, or null if that could not be determined. */
async function existingScoringBranches(repo: string): Promise<string[] | null> {
  const branches = await scoringBranches(repo);
  if (!branches) return null;
  const found: string[] = [];
  for (const branch of branches) {
    const exists = branch === branches[0] ? true : await branchExists(repo, branch);
    if (exists === undefined) return null;
    if (exists) found.push(branch);
  }
  return found;
}

async function getPrLedgerEntry(repo: string, number: number): Promise<ScoreLedgerEntry | null> {
  const result = await ghFetch(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/pulls/${number}`);
  if (!result.ok || !result.data) return null;
  const pr = result.data as Record<string, unknown>;
  const author = (pr.user as Record<string, string> | undefined)?.login || '';
  const headSha = (pr.head as Record<string, string> | undefined)?.sha || '';
  const createdAt = String(pr.created_at || '');
  const mergedAt = String(pr.merged_at || '');
  const merged = Boolean(mergedAt);
  const active = pr.state === 'open' || merged;
  const merger = (pr.merged_by as Record<string, string> | null)?.login || '';
  if (!author || !headSha || !createdAt || (merged && !merger)) return null;
  const branches = await scoringBranches(repo);
  if (!branches) return null;
  if (isPromotionPr(pr, branches)) return { key: `pr:${repo}:${number}`, repo, title: String(pr.title || 'PR'), awards: {}, lineAwards: {}, added: 0, deleted: 0, fileCount: 0, updatedAt: String(pr.updated_at || createdAt) };
  const diff = await getPrDiff(repo, number, headSha);
  if (!diff) return null;
  const awards: Record<string, ScoreAward> = {};
  const lineAwards: ScoreLedgerEntry['lineAwards'] = {};
  if (active && diff.fileCount) {
    const commits = await ghList(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/pulls/${number}/commits`);
    if (!commits) return null;
    const weights: Record<string, number> = {};
    const times: Record<string, string> = {};
    for (const item of commits) {
      const sha = String(item.sha || '');
      if (!sha) return null;
      const commitDiff = await getCommitDiff(repo, sha);
      if (!commitDiff) return null;
      const login = commitDiff.login || author;
      const time = (commitDiff.time && commitDiff.time > createdAt) ? commitDiff.time : createdAt;
      if (isBot(login)) continue;
      const key = `${login}|${awardMonth(time)}`;
      weights[key] = (weights[key] || 0) + commitDiff.added + commitDiff.deleted;
      if (!times[key] || time > times[key]) times[key] = time;
    }
    if (!Object.keys(weights).length && !isBot(author)) {
      const key = `${author}|${awardMonth(createdAt)}`;
      weights[key] = 1;
      times[key] = createdAt;
    }
    for (const [key, amount] of Object.entries(allocateXp(diff.codeXp, weights))) {
      const [login, month] = key.split('|');
      if (amount) awards[`code:${key}`] = { kind: 'code', login, month, amount, time: times[key] || createdAt };
    }
    const addedShares = allocateXp(diff.added, weights);
    const deletedShares = allocateXp(diff.deleted, weights);
    for (const key of new Set([...Object.keys(addedShares), ...Object.keys(deletedShares)])) {
      const [login, month] = key.split('|');
      lineAwards[key] = { login, month, added: addedShares[key] || 0, deleted: deletedShares[key] || 0 };
    }
    if (diff.openXp && !isBot(author)) awards[`open:${author}:${awardMonth(createdAt)}`] = award('pr-opened', author, diff.openXp, createdAt);
    if (merged && diff.mergeXp && !isBot(merger)) awards[`merge:${merger}:${awardMonth(mergedAt)}`] = award('pr-merged', merger, diff.mergeXp, mergedAt);
  }
  return { key: `pr:${repo}:${number}`, repo, title: String(pr.title || 'PR'), awards, lineAwards, added: diff.added, deleted: diff.deleted, fileCount: diff.fileCount, updatedAt: String(pr.updated_at || createdAt) };
}

async function getDirectLedgerEntry(repo: string, sha: string): Promise<ScoreLedgerEntry | null | undefined> {
  // v2: promotion PRs (staging -> main) no longer claim the commits they carry.
  const associationKey = `${repo}:${sha}:v2`;
  if (state.commitPrCache![associationKey] === undefined) {
    const branches = await scoringBranches(repo);
    if (!branches) return undefined;
    const prs = await ghList(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/commits/${sha}/pulls`, 2);
    if (!prs) return undefined;
    // Scored through a feature PR, or it is the merge/squash commit a PR created.
    state.commitPrCache![associationKey] = prs.some(pr => (pr.state === 'open' || Boolean(pr.merged_at)) && (!isPromotionPr(pr, branches) || pr.merge_commit_sha === sha));
  }
  if (state.commitPrCache![associationKey]) return null;
  const diff = await getCommitDiff(repo, sha);
  if (!diff) return undefined;
  if (!diff.login || !diff.time || isBot(diff.login)) return null;
  // Merge commits (e.g. `git merge staging` pushed to main) carry code already scored on its own commits.
  if ((diff.parents || 1) > 1) return null;
  const code = diff.codeXp;
  const month = awardMonth(diff.time);
  const awards = code ? { [`code:${diff.login}:${month}`]: award('code', diff.login, code, diff.time) } : {};
  const lineAwards = { [`${diff.login}|${month}`]: { login: diff.login, month, added: diff.added, deleted: diff.deleted } };
  return { key: `direct:${repo}:${sha}`, repo, title: diff.title || 'direct push', awards, lineAwards, added: diff.added, deleted: diff.deleted, fileCount: diff.fileCount, updatedAt: diff.time };
}

async function getDefaultBranch(repo: string): Promise<string | null> {
  if (state.defaultBranches?.[repo]) return state.defaultBranches[repo];
  const result = await ghFetch(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}`);
  const branch = (result.data as Record<string, unknown> | null)?.default_branch;
  if (!result.ok || typeof branch !== 'string') return null;
  state.defaultBranches![repo] = branch;
  return branch;
}

function rebuildScoringFeed(): void {
  const other = state.feed.filter(item => !(item.time >= state.monthStartDate &&
    (['pr-opened', 'pr-merged'].includes(item.type) || (item.type === 'commit' && !item.message.startsWith('created branch')))));
  const scored: FeedItem[] = [];
  for (const entry of Object.values(state.scoreLedger || {})) {
    for (const [id, item] of Object.entries(entry.awards)) {
      if (!item.amount || item.month !== state.monthStartDate) continue;
      scored.push({ id: `score:${entry.key}:${id}`, type: item.kind === 'code' ? 'commit' : item.kind,
        user: item.login, repo: entry.repo, message: item.kind === 'code' ? 'changed code' : item.kind === 'pr-opened' ? 'opened PR' : 'merged PR',
        detail: entry.title, xp: item.amount, time: item.time });
    }
  }
  state.feed = [...other, ...scored].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 50);
}

function recomputeScoredLines(): void {
  for (const stats of Object.values(state.stats)) { stats.monthlyLinesAdded = 0; stats.monthlyLinesDeleted = 0; }
  for (const entry of Object.values(state.scoreLedger || {})) for (const line of Object.values(entry.lineAwards)) {
    if (line.month !== state.monthStartDate) continue;
    ensureMember(line.login);
    state.stats[line.login].monthlyLinesAdded += line.added;
    state.stats[line.login].monthlyLinesDeleted += line.deleted;
  }
}

function replaceLedgerEntry(entry: ScoreLedgerEntry): void {
  if (state.scoringEpoch) {
    entry.awards = Object.fromEntries(Object.entries(entry.awards).filter(([, item]) => item.month >= state.scoringEpoch!));
    entry.lineAwards = Object.fromEntries(Object.entries(entry.lineAwards).filter(([, item]) => item.month >= state.scoringEpoch!));
  }
  const previous = state.scoreLedger![entry.key];
  const deltas: Record<string, number> = {};
  for (const item of Object.values(previous?.awards || {})) deltas[item.login] = (deltas[item.login] || 0) - item.amount;
  for (const item of Object.values(entry.awards)) deltas[item.login] = (deltas[item.login] || 0) + item.amount;
  for (const [login, delta] of Object.entries(deltas)) {
    ensureMember(login);
    state.stats[login].totalXp += delta;
  }
  const monthlyDeltas: Record<string, number> = {};
  for (const item of Object.values(previous?.awards || {})) if (item.month === state.monthStartDate) monthlyDeltas[item.login] = (monthlyDeltas[item.login] || 0) - item.amount;
  for (const item of Object.values(entry.awards)) if (item.month === state.monthStartDate) monthlyDeltas[item.login] = (monthlyDeltas[item.login] || 0) + item.amount;
  for (const [login, delta] of Object.entries(monthlyDeltas)) state.stats[login].monthlyXp += delta;
  state.scoreLedger![entry.key] = entry;
  recomputeScoredLines();
  rebuildScoringFeed();
  persistState();
  broadcast('state', getClientState());
}

const pendingScoring = new Set<string>();
async function reconcilePr(repo: string, number: number): Promise<void> {
  if (state.scoringVersion !== 2 || state.scoringHash !== scoreConfigHash()) return;
  const key = `pr:${repo}:${number}`;
  if (pendingScoring.has(key)) return;
  pendingScoring.add(key);
  try { const entry = await getPrLedgerEntry(repo, number); if (entry) replaceLedgerEntry(entry); }
  catch (err) { console.warn(`[server] Could not refresh PR score ${repo}#${number}:`, err); }
  finally { pendingScoring.delete(key); }
}

async function reconcileDirectCommit(repo: string, sha: string): Promise<void> {
  if (state.scoringVersion !== 2 || state.scoringHash !== scoreConfigHash()) return;
  const key = `direct:${repo}:${sha}`;
  if (state.scoreLedger?.[key] || pendingScoring.has(key)) return;
  pendingScoring.add(key);
  try { const entry = await getDirectLedgerEntry(repo, sha); if (entry) replaceLedgerEntry(entry); }
  catch (err) { console.warn(`[server] Could not refresh commit score ${repo}@${sha.slice(0, 8)}:`, err); }
  finally { pendingScoring.delete(key); }
}

/**
 * Once per month: PRs scored before promotion PRs were recognised (e.g. a
 * staging -> main release this month) drop to zero, since their code already
 * scored on the way into staging.
 */
async function rescorePromotionPrs(): Promise<void> {
  if (state.scoringVersion !== 2 || state.scoringHash !== scoreConfigHash() || state.promotionRescoreMonth === state.monthStartDate) return;
  let complete = true, cleared = 0;
  for (const [key, entry] of Object.entries(state.scoreLedger || {})) {
    if (!key.startsWith('pr:') || !Object.values(entry.awards).some(item => item.month === state.monthStartDate)) continue;
    const [, repo, number] = key.split(':');
    const branches = await scoringBranches(repo);
    const result = await ghFetch(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/pulls/${number}`);
    if (!branches || !result.ok || !result.data) { complete = false; continue; }
    if (!isPromotionPr(result.data as Record<string, unknown>, branches)) continue;
    replaceLedgerEntry({ ...entry, awards: {}, lineAwards: {}, added: 0, deleted: 0, fileCount: 0 });
    cleared++;
  }
  console.log(`[server] Promotion PR rescore: cleared ${cleared}${complete ? '' : ' (incomplete, will retry)'}`);
  if (complete) { state.promotionRescoreMonth = state.monthStartDate; persistState(); }
}

async function collectCurrentMonthScores(): Promise<Record<string, ScoreLedgerEntry>> {
  const from = state.monthStartDate;
  const to = todayStr();
  const [created, merged, updated, commits] = await Promise.all([
    searchAll('issues', `org:${GH_ORG} type:pr`, 'created', from, to),
    searchAll('issues', `org:${GH_ORG} type:pr is:merged`, 'merged', from, to),
    searchAll('issues', `org:${GH_ORG} type:pr`, 'updated', from, to),
    searchAll('commits', `org:${GH_ORG}`, 'committer-date', from, to),
  ]);
  if (![created, merged, updated, commits].every(result => result.complete)) throw new Error('GitHub search was incomplete; scores were not changed');
  const prs = new Map<string, { repo: string; number: number }>();
  for (const pr of [...created.items, ...merged.items, ...updated.items]) {
    const repo = String(pr.repository_url || '').split('/').pop() || '';
    const number = Number(pr.number);
    if (!repo || !number || (GH_REPOS.length && !GH_REPOS.includes(repo))) continue;
    prs.set(`${repo}:${number}`, { repo, number });
  }
  const entries: Record<string, ScoreLedgerEntry> = {};
  let processed = 0;
  for (const { repo, number } of prs.values()) {
    const entry = await getPrLedgerEntry(repo, number);
    if (!entry) throw new Error(`Could not score ${repo}#${number}; scores were not changed`);
    entry.awards = Object.fromEntries(Object.entries(entry.awards).filter(([, item]) => item.month >= from));
    entry.lineAwards = Object.fromEntries(Object.entries(entry.lineAwards).filter(([, item]) => item.month >= from));
    entries[entry.key] = entry;
    if (++processed % 25 === 0) { persistState(); console.log(`[server] Scored ${processed}/${prs.size} PRs for migration`); }
  }
  const repos = new Set<string>();
  for (const commit of commits.items) {
    const repo = (commit.repository as Record<string, string> | undefined)?.name;
    if (repo && (!GH_REPOS.length || GH_REPOS.includes(repo))) repos.add(repo);
  }
  for (const repo of repos) {
    const branches = await existingScoringBranches(repo);
    if (!branches) throw new Error(`Could not identify scoring branches for ${repo}; scores were not changed`);
    const branchCommits: Array<Record<string, unknown>> = [];
    for (const branch of branches) {
      const url = `${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&since=${encodeURIComponent(`${from}T00:00:00Z`)}`;
      const listed = await ghList(url);
      if (!listed) throw new Error(`Could not list ${branch} commits for ${repo}; scores were not changed`);
      branchCommits.push(...listed);
    }
    for (const commit of branchCommits) {
      const sha = String(commit.sha || '');
      if (!sha) continue;
      const entry = await getDirectLedgerEntry(repo, sha);
      if (entry === undefined) throw new Error(`Could not score ${repo}@${sha.slice(0, 8)}; scores were not changed`);
      if (entry) entries[entry.key] = entry;
    }
    persistState();
  }
  return entries;
}

function applyCurrentScoreSnapshot(entries: Record<string, ScoreLedgerEntry>): void {
  const before: Record<string, number> = {}, after: Record<string, number> = {};
  for (const entry of Object.values(state.scoreLedger || {})) for (const item of Object.values(entry.awards)) {
    if (item.month === state.monthStartDate) before[item.login] = (before[item.login] || 0) + item.amount;
  }
  for (const entry of Object.values(entries)) for (const item of Object.values(entry.awards)) {
    if (item.month === state.monthStartDate) after[item.login] = (after[item.login] || 0) + item.amount;
  }
  for (const login of new Set([...Object.keys(before), ...Object.keys(after)])) {
    ensureMember(login);
    const delta = (after[login] || 0) - (before[login] || 0);
    state.stats[login].monthlyXp += delta;
    state.stats[login].totalXp += delta;
  }
  const combined: Record<string, ScoreLedgerEntry> = {};
  for (const [key, old] of Object.entries(state.scoreLedger || {})) {
    combined[key] = { ...old,
      awards: Object.fromEntries(Object.entries(old.awards).filter(([, item]) => item.month < state.monthStartDate)),
      lineAwards: Object.fromEntries(Object.entries(old.lineAwards).filter(([, item]) => item.month < state.monthStartDate)),
    };
  }
  for (const [key, entry] of Object.entries(entries)) {
    combined[key] = { ...entry,
      awards: { ...combined[key]?.awards, ...entry.awards },
      lineAwards: { ...combined[key]?.lineAwards, ...entry.lineAwards },
    };
  }
  state.scoreLedger = combined;
  state.scoringHash = scoreConfigHash();
  recomputeScoredLines();
  rebuildScoringFeed();
  persistState();
  broadcast('state', getClientState());
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
    .sort((a, b) => b.monthlyXp - a.monthlyXp)
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
  s.monthlyXp += amount;
  s.totalXp += amount;
  const activityTime = eventTime || new Date().toISOString();
  if (!s.lastActivityTime || activityTime > s.lastActivityTime) s.lastActivityTime = activityTime;
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
  if (field === 'monthlyIssuesClosed' && s.monthlyIssuesClosed >= 10 && !s.badges.includes('ghostSlayer')) {
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

function bumpStreak(login: string, eventTime?: string): void {
  const s = state.stats[login];
  if (!s) return;
  const d = eventTime?.slice(0, 10) || todayStr();
  if (s.streakLastDate && s.streakLastDate >= d) return;
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
    s.monthlyXp += xpConfig.xpValues.streakBonus;
    s.totalXp += xpConfig.xpValues.streakBonus;
  }

  if (s.streak >= 30 && !s.badges.includes('ironDev')) awardBadge(login, 'ironDev');
  else if (s.streak >= 7 && !s.badges.includes('streakMaster')) awardBadge(login, 'streakMaster');
}

function addLineStats(login: string, added: number, deleted: number): void {
  const s = state.stats[login];
  if (!s) return;
  s.monthlyLinesAdded += added;
  s.monthlyLinesDeleted += deleted;
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
  const day = todayStr();
  if (state.dailyStartDate !== day) {
    for (const s of Object.values(state.stats)) { s.dailyCommits = 0; s.dailyIssuesClosed = 0; }
    state.dailyStartDate = day;
  }
  if (ms !== state.monthStartDate) {
    console.log(`[server] Monthly reset: ${state.monthStartDate} → ${ms}`);
    state.lastSeason = snapshotSeason();
    for (const login of Object.keys(state.stats)) {
      const s = state.stats[login];
      s.monthlyXp = 0; s.monthlyCommits = 0; s.monthlyPRsOpened = 0;
      s.monthlyPRsMerged = 0; s.monthlyPRsReviewed = 0; s.monthlyIssuesClosed = 0;
      s.monthlyIssuesOpened = 0;
      s.monthlyLinesAdded = 0; s.monthlyLinesDeleted = 0;
      s.dailyCommits = 0; s.dailyIssuesClosed = 0;
    }
    state.monthStartDate = ms;
    state.bossProgress = {};
    state.bossIndex = 0;
    state.previousRanks = {};
    creditedCommitShas.clear();
    state.commitLedgerSeeded = true;
    // NOTE: do NOT clear seenIds here. Events from the new month are filtered by
    // `eventTime < monthStart()` in processEvent; clearing seenIds would let any
    // already-processed events get re-credited to totalXp.
    broadcast('reset', {});
  }
}

// ── GitHub polling ───────────────────────────────
interface PushCommit { sha: string; login?: string; message?: string }

async function comparePushCommits(repo: string, before: string, head: string): Promise<PushCommit[] | null> {
  if (before === head) return [];
  const commits: PushCommit[] = [];
  for (let page = 1; page <= 30; page++) {
    const url = `${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/compare/${before}...${head}?per_page=100&page=${page}`;
    const result = await ghFetch(url);
    if (!result.ok || !result.data) return null;
    const data = result.data as Record<string, unknown>;
    if (!Array.isArray(data.commits)) return null;
    const batch = data.commits as Array<Record<string, unknown>>;
    for (const item of batch) {
      const sha = String(item.sha || '');
      if (!sha) continue;
      const commit = item.commit as Record<string, unknown> | undefined;
      commits.push({ sha,
        login: (item.author as Record<string, string> | undefined)?.login || (item.committer as Record<string, string> | undefined)?.login,
        message: String(commit?.message || '').split('\n')[0],
      });
    }
    if (commits.length >= Number(data.total_commits || 0) || batch.length < 100) return commits;
  }
  return null;
}

async function recordPushCommits(repo: string, ref: string, commits: PushCommit[], actor: string, avatarUrl: string, eventTime: string): Promise<void> {
  const branches = await scoringBranches(repo);
  if (!branches) throw new Error(`Default branch unavailable for ${repo}`);
  const isDefault = branches.some(branch => ref === `refs/heads/${branch}`);
  const linkedPrs = state.scoringVersion === 2 && !isDefault && commits.length
    ? await ghList(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/commits/${commits[commits.length - 1].sha}/pulls`, 2)
    : null;
  const linkedPr = linkedPrs?.find(pr => pr.state === 'open' || Boolean(pr.merged_at));
  const unseen = commits.filter(commit => commit.sha && !creditedCommitShas.has(commit.sha));
  const byAuthor = new Map<string, PushCommit[]>();
  for (const commit of unseen) {
    creditedCommitShas.add(commit.sha);
    const login = commit.login || actor;
    if (isBot(login)) continue;
    byAuthor.set(login, [...(byAuthor.get(login) || []), commit]);
  }
  for (const [login, authored] of byAuthor) {
    ensureMember(login, login === actor ? avatarUrl : '');
    incrementStat(login, 'monthlyCommits', authored.length);
    if (eventTime.slice(0, 10) === todayStr()) incrementStat(login, 'dailyCommits', authored.length);
    if (!state.stats[login].lastCommitDate || eventTime > state.stats[login].lastCommitDate!) state.stats[login].lastCommitDate = eventTime;
    bumpStreak(login, eventTime);
    if (state.scoringVersion !== 2) {
      addXp(login, eventXpValues().commit * authored.length, 'commit', repo, `shipped ${authored.length} commit${authored.length === 1 ? '' : 's'}`, authored[0]?.message, eventTime);
    } else if (!isDefault) {
      const name = ref.replace(/^refs\/heads\//, '');
      addXp(login, 0, 'branch-push', repo, `pushed ${authored.length} commit${authored.length === 1 ? '' : 's'}`, linkedPr ? `${name} · PR #${linkedPr.number} linked` : `${name} · awaiting PR`, eventTime);
    }
  }
  if (unseen.length) {
    const commitTotal = Object.values(state.stats).reduce((sum, stats) => sum + stats.monthlyCommits, 0);
    state.bossProgress.commits = Math.max(state.bossProgress.commits || 0, commitTotal);
  }
  if (state.scoringVersion === 2) {
    if (isDefault) {
      for (const commit of unseen) await reconcileDirectCommit(repo, commit.sha);
    } else if (linkedPrs) {
      for (const pr of linkedPrs) if (pr.state === 'open' && pr.number) await reconcilePr(repo, Number(pr.number));
    }
  }
}

async function processPushEvent(event: Record<string, unknown>): Promise<boolean> {
  const actorObj = event.actor as Record<string, string> | undefined;
  const actor = actorObj?.login || '';
  const repo = String((event.repo as Record<string, string> | undefined)?.name || '').split('/').pop() || '';
  const payload = event.payload as Record<string, unknown> | undefined;
  const ref = String(payload?.ref || '');
  const eventTime = String(event.created_at || new Date().toISOString());
  if (!actor || isBot(actor) || !repo || (GH_REPOS.length && !GH_REPOS.includes(repo)) || eventTime < state.monthStartDate || !ref.startsWith('refs/heads/')) return true;
  const head = String(payload?.head || '');
  const before = String(payload?.before || '');
  if (!/^[0-9a-f]{40}$/i.test(head) || !/^[0-9a-f]{40}$/i.test(before)) return false;
  let commits: PushCommit[] | null;
  if (Array.isArray(payload?.commits) && payload.commits.length) {
    commits = (payload.commits as Array<Record<string, unknown>>).map(item => ({
      sha: String(item.sha || ''),
      login: (item.author as Record<string, string> | undefined)?.username,
      message: String(item.message || '').split('\n')[0],
    })).filter(item => item.sha);
  } else {
    let base = before;
    if (/^0+$/.test(base)) base = await getDefaultBranch(repo) || '';
    commits = base ? await comparePushCommits(repo, base, head) : null;
  }
  if (!commits) return false;
  await recordPushCommits(repo, ref, commits, actor, actorObj?.avatar_url || '', eventTime);
  return true;
}

function processEvent(event: Record<string, unknown>): void {
  const xp = eventXpValues();
  const scored = state.scoringVersion === 2;
  const actorObj = event.actor as Record<string, string>;
  const actor = actorObj?.login;
  const avatarUrl = actorObj?.avatar_url || '';
  const repo = ((event.repo as Record<string, string>)?.name || '').split('/').pop() || '';
  const type = event.type as string;
  const payload = event.payload as Record<string, unknown>;
  const eventTime = (event.created_at as string) || undefined;

  if (!actor || isBot(actor)) return;
  if (eventTime && eventTime < monthStart()) return;
  if (GH_REPOS.length && !GH_REPOS.includes(repo)) return;

  ensureMember(actor, avatarUrl);

  switch (type) {
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
          if (!scored) addXp(actor, xp.prOpened, 'pr-opened', repo, 'opened PR', title, eventTime);
          incrementStat(actor, 'monthlyPRsOpened');
          const prAdd = (pr?.additions as number) || 0;
          const prDel = (pr?.deletions as number) || 0;
          if (!scored && (prAdd || prDel)) addLineStats(actor, prAdd, prDel);
        }
      } else if (action === 'closed' && pr?.merged) {
        const key = `rt-pr-merge-${repo}-${prNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          if (!scored) addXp(actor, xp.prMerged, 'pr-merged', repo, 'merged PR', title, eventTime);
          incrementStat(actor, 'monthlyPRsMerged');
          const prAdd = (pr?.additions as number) || 0;
          const prDel = (pr?.deletions as number) || 0;
          if (!scored && (prAdd || prDel)) addLineStats(actor, prAdd, prDel);
        }
      }
      if (scored && repo && prNum && ['opened', 'synchronize', 'reopened', 'closed'].includes(action)) void reconcilePr(repo, prNum);
      break;
    }
    case 'PullRequestReviewEvent': {
      if (payload.action !== 'submitted') break;
      const reviewPr = payload.pull_request as Record<string, unknown>;
      const reviewId = (payload.review as Record<string, unknown>)?.id || event.id;
      const key = `rt-review-${repo}-${reviewId}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        addXp(actor, xp.prReviewed, 'review', repo, 'reviewed PR', (reviewPr?.title as string) || '', eventTime);
        incrementStat(actor, 'monthlyPRsReviewed');
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
          incrementStat(actor, 'monthlyIssuesOpened');
        }
      } else if (action === 'closed') {
        const key = `rt-issue-close-${repo}-${issueNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, xp.issueClosed, 'issue', repo, 'closed issue', title, eventTime);
          incrementStat(actor, 'monthlyIssuesClosed');
          if (!eventTime || eventTime.slice(0, 10) === todayStr()) incrementStat(actor, 'dailyIssuesClosed');
        }
      }
      break;
    }
  }
}

function processIssueOrPR(item: Record<string, unknown>, repo: string): void {
  const xp = eventXpValues();
  const user = item.user as Record<string, string> | undefined;
  const login = user?.login;
  const avatarUrl = user?.avatar_url || '';
  if (!login || isBot(login)) return;

  const isPR = !!item.pull_request;
  const itemState = item.state as string;
  const title = (item.title as string) || '';
  const createdAt = item.created_at as string;
  const closedAt = item.closed_at as string | null;

  const ms = monthStart();
  const latestTime = closedAt || createdAt;
  if (latestTime && latestTime < ms) return;

  ensureMember(login, avatarUrl);

  if (isPR) {
    const openKey = `rt-pr-open-${repo}-${item.number}`;
    if (createdAt >= ms && !seenIds.has(openKey)) {
      seenIds.add(openKey);
      if (state.scoringVersion !== 2) addXp(login, xp.prOpened, 'pr-opened', repo, 'opened PR', title, createdAt);
      incrementStat(login, 'monthlyPRsOpened');
    }
    if (state.scoringVersion === 2 && item.number) {
      const key = `pr:${repo}:${item.number}`;
      const updatedAt = String(item.updated_at || '');
      if (!state.scoreLedger?.[key] || updatedAt > state.scoreLedger[key].updatedAt) void reconcilePr(repo, Number(item.number));
    }
    // The issues list names the PR author, not the merger. The event poller and
    // full sync fetch the merger's identity before awarding merge XP.
  } else {
    const openKey = `rt-issue-open-${repo}-${item.number}`;
    if (createdAt >= ms && !seenIds.has(openKey)) {
      seenIds.add(openKey);
      addXp(login, xp.issueOpened, 'issue-opened', repo, 'opened issue', title, createdAt);
      incrementStat(login, 'monthlyIssuesOpened');
    }
    // Likewise, a closed issue must be credited to its closer, not its author.
  }
}

let polling = false;
let syncing = false;
let migrationRunning = false;
let lastDirectSweep = 0;
let repoPollCursor = 0;
let lastRepoRefresh = 0;

async function scanBranchHeads(repo: string): Promise<boolean> {
  const branches = await ghList(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/branches`, 30);
  if (!branches) return false;
  const bootstrapCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  for (let i = 0; i < branches.length; i += 10) {
    const batch = branches.slice(i, i + 10);
    const candidates = await Promise.all(batch.map(async item => {
      const name = String(item.name || '');
      const sha = String((item.commit as Record<string, string> | undefined)?.sha || '');
      if (!name || !sha) return null;
      const key = `${repo}:${name}`;
      const previous = state.branchHeads![key];
      if (previous === sha) return null;
      if (previous) {
        const commits = await comparePushCommits(repo, previous, sha);
        if (!commits) {
          const diff = await getCommitDiff(repo, sha);
          if (!diff) return { key, sha, name, retry: true };
          return { key, sha, name, commits: [{ sha, login: diff.login, message: diff.title }], actor: diff.login || '', time: new Date().toISOString() };
        }
        return { key, sha, name, commits, actor: commits[commits.length - 1]?.login || '', time: new Date().toISOString() };
      }
      const diff = await getCommitDiff(repo, sha);
      if (!diff) return { key, sha, name, retry: true };
      return { key, sha, name, commits: diff.time && diff.time >= bootstrapCutoff ? [{ sha, login: diff.login, message: diff.title }] : [], actor: diff.login || '', time: diff.time || new Date().toISOString() };
    }));
    for (const candidate of candidates) {
      if (!candidate) continue;
      if ('retry' in candidate) return false;
      if (candidate.commits.length && candidate.actor) {
        await recordPushCommits(repo, `refs/heads/${candidate.name}`, candidate.commits, candidate.actor, '', candidate.time);
      }
      state.branchHeads![candidate.key] = candidate.sha;
    }
  }
  return true;
}

async function refreshHotRepositories(): Promise<void> {
  if (Date.now() - lastRepoRefresh < 60_000) return;
  lastRepoRefresh = Date.now();
  let repos: Array<Record<string, unknown>> | null;
  if (GH_REPOS.length) {
    const results = await Promise.all(GH_REPOS.map(repo => ghFetch(`${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}`)));
    repos = results.every(result => result.ok && result.data) ? results.map(result => result.data as Record<string, unknown>) : null;
  } else {
    repos = await ghList(`${BASE}/orgs/${encodeURIComponent(GH_ORG)}/repos?sort=pushed`, 10);
  }
  if (!repos) return;
  const sorted = repos.filter(repo => typeof repo.name === 'string').sort((a, b) => String(b.pushed_at || '').localeCompare(String(a.pushed_at || '')));
  state.repos = sorted.map(repo => String(repo.name));
  const cutoff = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const changed = sorted.filter(repo => {
    const name = String(repo.name);
    const pushed = String(repo.pushed_at || '');
    return pushed >= cutoff && pushed > (state.repoPushedAt![name] || '');
  }).slice(0, 6);
  for (const repo of changed) {
    const name = String(repo.name);
    try {
      if (await scanBranchHeads(name)) state.repoPushedAt![name] = String(repo.pushed_at);
    } catch (err) { console.warn(`[server] Could not scan branch heads for ${name}:`, err); }
  }
}

async function pollEvents(): Promise<void> {
  if (polling || syncing || migrationRunning) return;
  polling = true;
  try {
  reloadConfigIfChanged();
  checkMonthlyReset();

  await refreshHotRepositories();

  let eventsProcessed = 0;

  const ingest = async (event: Record<string, unknown>): Promise<boolean> => {
    const id = String(event.id || '');
    if (!id) return false;
    if (event.type === 'PushEvent') {
      if (processedPushIds.has(id)) return false;
      try {
        if (!await processPushEvent(event)) return false;
        processedPushIds.add(id);
      } catch (err) { console.warn(`[server] Could not process push event ${id}:`, err); return false; }
    } else {
      if (seenIds.has(id)) return false;
      processEvent(event);
    }
    seenIds.add(id);
    return true;
  };

  // Org events
  try {
    const { data, etag, notModified } = await ghFetch(
      `${BASE}/orgs/${encodeURIComponent(GH_ORG)}/events?per_page=100`,
      state.etags['__org__'],
    );
    state.etags['__org__'] = etag || '';
    if (!notModified && Array.isArray(data)) {
      for (const event of [...data].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) {
        if (await ingest(event)) eventsProcessed++;
      }
    }
  } catch (err) { console.warn('[server] org events error:', err); }

  // Rotate through repositories instead of requesting every repo twice on
  // every poll. Org events cover the gaps between per-repo checks.
  const repoCount = Math.min(2, state.repos.length);
  const rotatingRepos = Array.from({ length: repoCount }, (_, i) => state.repos[(repoPollCursor + i) % state.repos.length]);
  const replayRepos = state.repos.filter(repo => state.repoPushedAt?.[repo] && !pushReplayDoneRepos.has(repo)).slice(0, 6);
  const reposToCheck = [...new Set([...replayRepos, ...rotatingRepos])];
  if (state.repos.length) repoPollCursor = (repoPollCursor + repoCount) % state.repos.length;
  const REPO_BATCH = 5;
  for (let i = 0; i < reposToCheck.length; i += REPO_BATCH) {
    const batch = reposToCheck.slice(i, i + REPO_BATCH);
    const batchBefore = eventsProcessed;

    await Promise.allSettled(batch.map(async (repo) => {
      try {
        const replay = replayRepos.includes(repo);
        const { data, etag, notModified } = await ghFetch(
          `${BASE}/repos/${encodeURIComponent(GH_ORG)}/${encodeURIComponent(repo)}/events?per_page=100`,
          replay ? undefined : state.etags[repo],
        );
        state.etags[repo] = etag || '';
        if (!notModified && Array.isArray(data)) {
          let replayComplete = true;
          for (const event of [...data].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) {
            if (replay && event.type !== 'PushEvent' && !seenIds.has(String(event.id)) && String(event.created_at || '') < serverStartedAt) {
              seenIds.add(String(event.id));
              continue;
            }
            if (await ingest(event)) eventsProcessed++;
            if (replay && event.type === 'PushEvent' && !processedPushIds.has(String(event.id))) replayComplete = false;
          }
          if (replay && replayComplete) pushReplayDoneRepos.add(repo);
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
  if (syncing || polling || migrationRunning) return;
  syncing = true;
  try {
  reloadConfigIfChanged();
  checkMonthlyReset();
  const xp = eventXpValues();
  const scored = state.scoringVersion === 2;
  const ws = monthStart();
  const today = todayStr();

  if (scored && state.scoringHash !== scoreConfigHash()) {
    try { applyCurrentScoreSnapshot(await collectCurrentMonthScores()); }
    catch (err) { console.warn('[server] Could not apply updated scoring config:', err); }
  }
  const canScore = scored && state.scoringHash === scoreConfigHash();

  try {
    // Parallel search queries
    const [commitResult, prCreatedResult, prMergedResult, issueClosedResult, issueOpenedResult, prUpdatedResult] = await Promise.allSettled([
      searchAll('commits', `org:${GH_ORG}`, 'committer-date', ws, today),
      searchAll('issues', `org:${GH_ORG} type:pr`, 'created', ws, today),
      searchAll('issues', `org:${GH_ORG} type:pr is:merged`, 'merged', ws, today),
      searchAll('issues', `org:${GH_ORG} type:issue is:closed`, 'closed', ws, today),
      searchAll('issues', `org:${GH_ORG} type:issue`, 'created', ws, today),
      scored ? searchAll('issues', `org:${GH_ORG} type:pr`, 'updated', ws, today) : Promise.resolve({ items: [], complete: true }),
    ]);
    const searchData = (result: PromiseSettledResult<SearchResult>): SearchResult => result.status === 'fulfilled' ? result.value : { items: [], complete: false };
    const commitsSearch = searchData(commitResult), prCreatedSearch = searchData(prCreatedResult), prMergedSearch = searchData(prMergedResult), issueClosedSearch = searchData(issueClosedResult), issueOpenedSearch = searchData(issueOpenedResult);
    const prUpdatedSearch = searchData(prUpdatedResult);

    // Commits
    const commitItems = commitsSearch.complete ? commitsSearch.items : [];
    const commitsByUser: Record<string, { count: number; unseen: number; todayCount: number; avatarUrl: string; repos: Set<string>; lastMsg: string; lastTime: string }> = {};
    const searchCommitShas = new Set<string>();
    for (const c of commitItems) {
      const co = c as Record<string, unknown>;
      const sha = co.sha as string;
      const repo = (co.repository as Record<string, string>)?.name || '';
      if (!sha || searchCommitShas.has(sha) || (GH_REPOS.length && !GH_REPOS.includes(repo))) continue;
      searchCommitShas.add(sha);
      const login = (co.author as Record<string, string>)?.login || (co.committer as Record<string, string>)?.login;
      if (!login || isBot(login)) continue;
      const avatar = (co.author as Record<string, string>)?.avatar_url || '';
      const msg = ((co.commit as Record<string, unknown>)?.message as string || '');
      const commit = co.commit as Record<string, unknown> | undefined;
      const time = (commit?.committer as Record<string, string> | undefined)?.date || (commit?.author as Record<string, string> | undefined)?.date || '';
      if (!commitsByUser[login]) commitsByUser[login] = { count: 0, unseen: 0, todayCount: 0, avatarUrl: avatar, repos: new Set(), lastMsg: '', lastTime: '' };
      commitsByUser[login].count++;
      if (!creditedCommitShas.has(sha)) commitsByUser[login].unseen++;
      if (time.slice(0, 10) === today) commitsByUser[login].todayCount++;
      commitsByUser[login].repos.add(repo);
      if (time > commitsByUser[login].lastTime) {
        commitsByUser[login].lastMsg = msg.split('\n')[0];
        commitsByUser[login].lastTime = time;
      }
    }

    // PR numbers are only unique within a repository.
    const prCreatedItems = prCreatedSearch.complete ? prCreatedSearch.items : [];
    const prMergedItems = prMergedSearch.complete ? prMergedSearch.items : [];
    const prKey = (p: Record<string, unknown>) => `${p.repository_url || ''}#${p.number || ''}`;
    const createdKeys = new Set(prCreatedItems.map(prKey));
    const mergedKeys = new Set(prMergedItems.map(prKey));
    const prAllItems = [...new Map([...prCreatedItems, ...prMergedItems, ...(prUpdatedSearch.complete ? prUpdatedSearch.items : [])].map(p => [prKey(p), p])).values()];
    const prDataByUser: Record<string, { opens: number; merges: number; avatarUrl: string }> = {};
    let mergesComplete = prMergedSearch.complete;
    const prFeedRaw: Array<{ login: string; title: string; repo: string; time: string; merged: boolean; key: string }> = [];
    const prDetailUrls: Array<{ login: string; url: string; repo: string; title: string; mergedAt: string; key: string }> = [];
    for (const pr of prAllItems) {
      const p = pr as Record<string, unknown>;
      const login = (p.user as Record<string, string>)?.login;
      if (!login) continue;
      const avatar = (p.user as Record<string, string>)?.avatar_url || '';
      const repo = ((p.repository_url as string) || '').split('/').pop() || '';
      if (GH_REPOS.length && !GH_REPOS.includes(repo)) continue;
      const title = (p.title as string) || '';
      const key = prKey(p);
      if (createdKeys.has(key) && !isBot(login)) {
        if (!prDataByUser[login]) prDataByUser[login] = { opens: 0, merges: 0, avatarUrl: avatar };
        prDataByUser[login].opens++;
        prFeedRaw.push({ login, title, repo, time: p.created_at as string, merged: false, key });
      }
      const prUrl = (p.pull_request as Record<string, string>)?.url;
      if (prUrl) prDetailUrls.push({ login, url: prUrl, repo, title, mergedAt: (p.pull_request as Record<string, string>)?.merged_at || '', key });
      else if (mergedKeys.has(key)) mergesComplete = false;
    }

    // Fetch PR details to get line stats (additions/deletions)
    const linesByUser: Record<string, { added: number; deleted: number }> = {};
    const BATCH_SIZE = 5;
    for (let i = 0; i < prDetailUrls.length; i += BATCH_SIZE) {
      const batch = prDetailUrls.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(({ url }) => ghFetch(url)));
      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        if (result.status !== 'fulfilled' || !result.value.ok || !result.value.data) {
          if (mergedKeys.has(batch[j].key)) mergesComplete = false;
          continue;
        }
        const prDetail = result.value.data as Record<string, unknown>;
        const adds = (prDetail.additions as number) || 0;
        const dels = (prDetail.deletions as number) || 0;
        const login = batch[j].login;
        if (!scored && !isBot(login)) {
          if (!linesByUser[login]) linesByUser[login] = { added: 0, deleted: 0 };
          linesByUser[login].added += adds;
          linesByUser[login].deleted += dels;
        }
        if (mergedKeys.has(batch[j].key)) {
          const merger = (prDetail.merged_by as Record<string, string> | null)?.login;
          if (merger && !isBot(merger)) {
            if (!prDataByUser[merger]) prDataByUser[merger] = { opens: 0, merges: 0, avatarUrl: (prDetail.merged_by as Record<string, string>)?.avatar_url || '' };
            prDataByUser[merger].merges++;
            prFeedRaw.push({ login: merger, title: batch[j].title, repo: batch[j].repo, time: batch[j].mergedAt, merged: true, key: batch[j].key });
          } else if (!merger) mergesComplete = false;
        }
      }
    }

    // Issues closed
    const closedIssues = issueClosedSearch.complete ? issueClosedSearch.items : [];
    let closesComplete = issueClosedSearch.complete;
    const issuesClosedByUser: Record<string, { count: number; avatarUrl: string }> = {};
    const issueFeedRaw: Array<{ login: string; title: string; repo: string; time: string; key: string }> = [];
    for (let i = 0; i < closedIssues.length; i += 5) {
      const batch = closedIssues.slice(i, i + 5);
      const results = await Promise.allSettled(batch.map(issue => issue.closed_by
        ? Promise.resolve({ data: issue, ok: true })
        : ghFetch(issue.url as string)));
      for (let j = 0; j < batch.length; j++) {
        const iss = batch[j], result = results[j];
        if (result.status !== 'fulfilled' || !result.value.ok || !result.value.data) { closesComplete = false; continue; }
        const detail = result.value.data as Record<string, unknown>;
        const closer = detail.closed_by as Record<string, string> | null;
        const login = closer?.login;
        const repo = ((iss.repository_url as string) || '').split('/').pop() || '';
        if (!login) { closesComplete = false; continue; }
        if (isBot(login) || (GH_REPOS.length && !GH_REPOS.includes(repo))) continue;
        if (!issuesClosedByUser[login]) issuesClosedByUser[login] = { count: 0, avatarUrl: closer?.avatar_url || '' };
        issuesClosedByUser[login].count++;
        issueFeedRaw.push({ login, title: (iss.title as string) || '', repo, time: (iss.closed_at as string) || '', key: `${iss.repository_url}#${iss.number}` });
      }
    }

    // Issue opens for XP
    const openedIssues = issueOpenedSearch.complete ? issueOpenedSearch.items : [];
    const issuesOpenedByUser: Record<string, { count: number }> = {};
    for (const issue of openedIssues) {
      const iss = issue as Record<string, unknown>;
      const login = (iss.user as Record<string, string>)?.login;
      if (!login || isBot(login)) continue;
      const repo = ((iss.repository_url as string) || '').split('/').pop() || '';
      if (GH_REPOS.length && !GH_REPOS.includes(repo)) continue;
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
    const creditedCommitsByUser = new Map<string, number>();

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

      const avatarUrl = c?.avatarUrl || p?.avatarUrl || ic?.avatarUrl || '';
      ensureMember(login, avatarUrl);
      const s = state.stats[login] || emptyStats(login);

      // Per-category reconciliation: each search query may succeed or fail
      // independently (rate limits, partial results), so credit each category
      // on its own. Counters are monotonically increasing — search can only
      // bump them upward — and monthlyXp/totalXp gain exactly the XP value of
      // the new events. This keeps monthlyXp == sum(counter * xpValue) regardless
      // of which queries returned, and is robust against double-counting because
      // poller-credited events are already reflected in the existing counter.
      let totalDelta = 0;
      let commitDelta = 0;
      const bumpCategory = (searchCount: number, currentField: keyof DevStats, xpPerEvent: number) => {
        const current = (s[currentField] as number) || 0;
        if (searchCount > current) {
          const eventDelta = searchCount - current;
          (s as unknown as Record<string, number>)[currentField as string] = searchCount;
          totalDelta += eventDelta * xpPerEvent;
        }
      };
      if (commitsSearch.complete) {
        if (state.commitLedgerSeeded) {
          commitDelta = c?.unseen || 0;
          s.monthlyCommits += commitDelta;
          totalDelta += commitDelta * (scored ? 0 : xp.commit);
        } else {
          const beforeCommits = s.monthlyCommits;
          bumpCategory(commits, 'monthlyCommits', scored ? 0 : xp.commit);
          commitDelta = s.monthlyCommits - beforeCommits;
        }
      }
      creditedCommitsByUser.set(login, commitDelta);
      if (prCreatedSearch.complete) bumpCategory(prOpens, 'monthlyPRsOpened', scored ? 0 : xp.prOpened);
      if (mergesComplete) bumpCategory(prMerges, 'monthlyPRsMerged', scored ? 0 : xp.prMerged);
      if (closesComplete) bumpCategory(issueCloses, 'monthlyIssuesClosed', xp.issueClosed);
      if (issueOpenedSearch.complete) bumpCategory(issueOpens, 'monthlyIssuesOpened', xp.issueOpened);
      if (c?.lastTime && (!s.lastCommitDate || c.lastTime > s.lastCommitDate)) s.lastCommitDate = c.lastTime;
      if (c && commitsSearch.complete) s.dailyCommits = Math.max(s.dailyCommits, c.todayCount);
      if (totalDelta > 0) {
        if (totalDelta > 5000) {
          console.warn(`[server] Suspicious XP delta for ${login}: +${totalDelta} (search counts c=${commits} pO=${prOpens} pM=${prMerges} iC=${issueCloses} iO=${issueOpens})`);
        }
        s.monthlyXp += totalDelta;
        s.totalXp += totalDelta;
      }
      const lines = linesByUser[login];
      if (!scored && lines) {
        if (lines.added > s.monthlyLinesAdded) s.monthlyLinesAdded = lines.added;
        if (lines.deleted > s.monthlyLinesDeleted) s.monthlyLinesDeleted = lines.deleted;
      }
      state.stats[login] = s;
    }
    if (commitsSearch.complete) {
      for (const sha of searchCommitShas) creditedCommitShas.add(sha);
      state.commitLedgerSeeded = true;
    }

    // Generate feed items from search results
    const newFeedItems: FeedItem[] = [];
    const existingIds = new Set(state.feed.map(f => f.id));

    for (const login of scored ? [] : allLogins) {
      const c = commitsByUser[login];
      const newCommitCount = creditedCommitsByUser.get(login) || 0;
      if (c && c.lastMsg && newCommitCount > 0) {
        const id = `sync-commit-${login}-${c.lastTime}`;
        if (!existingIds.has(id)) {
          newFeedItems.push({
            id,
            type: 'commit',
            user: login,
            repo: [...c.repos][0] || '',
            message: `shipped ${newCommitCount} commit${newCommitCount > 1 ? 's' : ''}`,
            detail: c.lastMsg,
            xp: newCommitCount * xp.commit,
            time: c.lastTime,
          });
          existingIds.add(id);
        }
      }
    }

    for (const item of scored ? [] : prFeedRaw) {
      if (item.merged && !mergesComplete) continue;
      const actionKey = `rt-pr-${item.merged ? 'merge' : 'open'}-${item.repo}-${item.key.split('#').pop()}`;
      if (seenIds.has(actionKey)) continue;
      seenIds.add(actionKey);
      const id = `sync-pr-${item.merged ? 'merge' : 'open'}-${item.key}`;
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
      if (!closesComplete) continue;
      const actionKey = `rt-issue-close-${item.repo}-${item.key.split('#').pop()}`;
      if (seenIds.has(actionKey)) continue;
      seenIds.add(actionKey);
      const id = `sync-issue-${item.key}`;
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

    if (canScore) {
      const changed = prAllItems.filter(pr => {
        const repo = String(pr.repository_url || '').split('/').pop() || '';
        if (!repo || (GH_REPOS.length && !GH_REPOS.includes(repo))) return false;
        const key = `pr:${repo}:${pr.number}`;
        return !state.scoreLedger?.[key] || String(pr.updated_at || '') > state.scoreLedger[key].updatedAt;
      });
      for (const pr of changed) {
        const repo = String(pr.repository_url || '').split('/').pop() || '';
        await reconcilePr(repo, Number(pr.number));
      }
    }
    if (canScore && commitsSearch.complete && Date.now() - lastDirectSweep > 30 * 60_000) {
      const reposWithCommits = new Set(commitItems.map(commit => (commit.repository as Record<string, string> | undefined)?.name).filter((repo): repo is string => Boolean(repo)));
      let sweepComplete = true;
      for (const repo of reposWithCommits) {
        const branches = await existingScoringBranches(repo);
        if (!branches) { sweepComplete = false; continue; }
        for (const branch of branches) {
          const url = `${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&since=${encodeURIComponent(`${ws}T00:00:00Z`)}`;
          const branchCommits = await ghList(url);
          if (!branchCommits) { sweepComplete = false; continue; }
          for (const commit of branchCommits) {
            const sha = String(commit.sha || '');
            if (sha && !state.scoreLedger?.[`direct:${repo}:${sha}`]) await reconcileDirectCommit(repo, sha);
          }
        }
      }
      if (sweepComplete) lastDirectSweep = Date.now();
    }

    // Boss progress
    const totalMerged = Object.values(prDataByUser).reduce((a, p) => a + p.merges, 0);
    if (mergesComplete) state.bossProgress.prsMerged = totalMerged;
    if (closesComplete) state.bossProgress.issuesClosed = Object.values(issuesClosedByUser).reduce((a, s) => a + s.count, 0);
    const searchCommitTotal = Object.values(commitsByUser).reduce((a, c) => a + c.count, 0);
    const statsCommitTotal = Object.values(state.stats).reduce((a, s) => a + s.monthlyCommits, 0);
    state.bossProgress.commits = commitsSearch.complete ? Math.max(searchCommitTotal, statsCommitTotal) : statsCommitTotal;

    // Advance one objective at a time. Progress is monthly and carries into
    // the next objective; clearing it would hide already earned activity.
    while (xpConfig.bossGoals[state.bossIndex] && (state.bossProgress[xpConfig.bossGoals[state.bossIndex].metric] || 0) >= xpConfig.bossGoals[state.bossIndex].target) {
      broadcast('overlay', { type: 'boss-victory', payload: { bossIndex: state.bossIndex } });
      state.bossIndex++;
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
        s.monthlyPRsReviewed > (best?.monthlyPRsReviewed || 0) ? s : best, allStats[0]);
      const closer = allStats.reduce((best, s) =>
        s.monthlyIssuesClosed > (best?.monthlyIssuesClosed || 0) ? s : best, allStats[0]);
      const speed = allStats.reduce((best, s) =>
        s.monthlyPRsMerged > (best?.monthlyPRsMerged || 0) ? s : best, allStats[0]);
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
// ── CI watch ─────────────────────────────────────
// Polls GitHub Actions on the scoring branches of recently pushed repos.
// A newly failing branch plants a spike; the next green run defuses it.
const ciEtags = new Map<string, string>();
const ciRuns = new Map<string, Array<Record<string, unknown>>>();
const CI_FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
async function pollCi(): Promise<void> {
  if (DEMO_MODE || Date.now() < ghRateLimitedUntil.core) return;
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const repos = Object.entries(state.repoPushedAt || {})
    .filter(([name, pushed]) => pushed >= cutoff && (!GH_REPOS.length || GH_REPOS.includes(name)))
    .sort((a, b) => b[1].localeCompare(a[1])).slice(0, 20).map(([name]) => name);
  let changed = false;
  for (const repo of repos) {
    const branches = await existingScoringBranches(repo);
    if (!branches) continue;
    for (const branch of branches) {
      const key = `${repo}:${branch}`;
      const url = `${BASE}/repos/${GH_ORG}/${encodeURIComponent(repo)}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=30&exclude_pull_requests=true`;
      const result = await ghFetch(url, ciEtags.get(url));
      if (!result.ok) continue;
      if (result.etag) ciEtags.set(url, result.etag);
      if (!result.notModified) ciRuns.set(url, ((result.data as Record<string, unknown> | null)?.workflow_runs as Array<Record<string, unknown>>) || []);
      const runs = (ciRuns.get(url) || []).filter(run => run.event !== 'pull_request' && run.status === 'completed' && run.conclusion !== 'cancelled' && run.conclusion !== 'skipped');
      // Newest completed run per workflow decides that workflow's state.
      const latest = new Map<string, Record<string, unknown>>();
      for (const run of runs) { const id = String(run.workflow_id); if (!latest.has(id)) latest.set(id, run); }
      const previous = state.ciStatus![key];
      if (!latest.size) { if (previous) { delete state.ciStatus![key]; changed = true; } continue; }
      const failed = [...latest.values()].filter(run => CI_FAILED.has(String(run.conclusion)));
      const actorOf = (run: Record<string, unknown>) => (run.triggering_actor as Record<string, string> | undefined)?.login || (run.actor as Record<string, string> | undefined)?.login;
      if (failed.length) {
        const run = failed[0];
        const next: CiStatus = { repo, branch, failing: true, workflow: failed.map(r => String(r.name || 'CI')).join(', '), url: String(run.html_url || ''), since: previous?.failing ? previous.since : String(run.updated_at || run.created_at || new Date().toISOString()), actor: previous?.failing ? previous.actor : actorOf(run) };
        if (JSON.stringify(next) !== JSON.stringify(previous)) { state.ciStatus![key] = next; changed = true; }
        if (previous && !previous.failing) broadcast('overlay', { type: 'spike-planted', payload: { login: next.actor || repo, repo, branch, workflow: next.workflow } });
      } else {
        const fixer = actorOf([...latest.values()][0]);
        if (previous?.failing) broadcast('overlay', { type: 'spike-defused', payload: { login: fixer || repo, repo, branch, since: previous.since } });
        if (!previous || previous.failing) { state.ciStatus![key] = { repo, branch, failing: false, workflow: '', url: '', since: new Date().toISOString() }; changed = true; }
      }
    }
  }
  if (changed) { persistState(); broadcast('state', getClientState()); }
}

/** Distinct UTC days this month on which each player earned XP. */
function activeDaysThisMonth(): Record<string, number> {
  const days: Record<string, Set<string>> = {};
  const add = (login: string, time: string) => { if (time >= state.monthStartDate) (days[login] ||= new Set()).add(time.slice(0, 10)); };
  for (const entry of Object.values(state.scoreLedger || {})) for (const item of Object.values(entry.awards)) if (item.amount > 0) add(item.login, item.time);
  for (const item of state.feed) if (item.xp > 0) add(item.user, item.time);
  return Object.fromEntries(Object.entries(days).map(([login, set]) => [login, set.size]));
}

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
    monthStartDate: state.monthStartDate,
    lastSeason: state.lastSeason || null,
    ciAlerts: Object.values(state.ciStatus || {}).filter(item => item.failing),
    activeDays: activeDaysThisMonth(),
    xpConfig,
  };
}

// ── Express server ───────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Admin-secret middleware — protects destructive endpoints.
// If GITARENA_ADMIN_SECRET is set, the caller must supply the same value
// in the X-Admin-Secret request header. Skipped when secret is not configured
// (i.e. local development without the env var set).
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!ADMIN_SECRET) { next(); return; }
  const provided = req.headers['x-admin-secret'];
  if (!provided || provided !== ADMIN_SECRET) {
    res.status(403).json({ error: 'Forbidden: missing or invalid X-Admin-Secret header' });
    return;
  }
  next();
}

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
app.put('/api/config', requireAdmin, (req, res) => {
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

// Convert only the current month's legacy commit/PR points. Existing review,
// issue, branch, streak and prior-month XP remain in the persisted state.
app.post('/api/scoring/migrate', requireAdmin, async (_req, res) => {
  if (state.scoringVersion === 2) { res.json({ ok: true, alreadyMigrated: true }); return; }
  if (migrationRunning || polling || syncing) { res.status(409).json({ error: 'Sync in progress; retry shortly' }); return; }
  migrationRunning = true;
  try {
    reloadConfigIfChanged();
    checkMonthlyReset();
    const entries = await collectCurrentMonthScores();
    const newXp: Record<string, number> = {};
    for (const entry of Object.values(entries)) for (const item of Object.values(entry.awards)) {
      if (item.month === state.monthStartDate) newXp[item.login] = (newXp[item.login] || 0) + item.amount;
    }
    const oldXp = { ...xpConfig.xpValues, ...xpConfig.legacyXpValues };
    const rows = [...new Set([...Object.keys(state.stats), ...Object.keys(newXp)])].map(login => {
      const s = state.stats[login] || emptyStats(login);
      const prior = s.monthlyCommits * oldXp.commit + s.monthlyPRsOpened * oldXp.prOpened + s.monthlyPRsMerged * oldXp.prMerged;
      return { login, oldCodeAndPrXp: prior, newCodeAndPrXp: newXp[login] || 0,
        monthlyBefore: s.monthlyXp, totalBefore: s.totalXp,
        monthlyAfter: s.monthlyXp - prior + (newXp[login] || 0),
        totalAfter: s.totalXp - prior + (newXp[login] || 0) };
    });
    const invalid = rows.find(row => row.monthlyAfter < 0 || row.totalAfter < 0);
    if (invalid) throw new Error(`Cannot safely migrate ${invalid.login}: legacy counter XP exceeds the recorded score`);
    for (const row of rows) {
      ensureMember(row.login);
      state.stats[row.login].monthlyXp = row.monthlyAfter;
      state.stats[row.login].totalXp = row.totalAfter;
    }
    state.scoreLedger = entries;
    state.scoringEpoch = state.monthStartDate;
    state.scoringVersion = 2;
    state.scoringHash = scoreConfigHash();
    recomputeScoredLines();
    rebuildScoringFeed();
    persistState();
    broadcast('state', getClientState());
    res.json({ ok: true, entries: Object.keys(entries).length, rows });
  } catch (err) {
    console.warn('[server] Scoring migration failed:', err);
    res.status(503).json({ error: String(err) });
  } finally {
    migrationRunning = false;
  }
});

// Force recalculate (wipe state and re-sync)
app.post('/api/recalculate', requireAdmin, async (_req, res) => {
  if (migrationRunning || polling || syncing) { res.status(409).json({ error: 'Sync in progress; retry shortly' }); return; }
  if (state.scoringVersion === 2) {
    migrationRunning = true;
    let entries: Record<string, ScoreLedgerEntry>;
    try { entries = await collectCurrentMonthScores(); }
    catch (err) { migrationRunning = false; res.status(503).json({ error: String(err) }); return; }
    state.scoreLedger = entries;
    migrationRunning = false;
  }
  console.log('[server] Force recalculate requested');
  // Preserve members (avatars, colors) but reset XP
  for (const login of Object.keys(state.stats)) {
    state.stats[login] = emptyStats(login);
  }
  state.feed = [];
  state.bossProgress = {};
  state.previousRanks = {};
  seenIds.clear();
  creditedCommitShas.clear();
  state.commitLedgerSeeded = true;
  if (state.scoringVersion === 2) {
    for (const entry of Object.values(state.scoreLedger || {})) for (const item of Object.values(entry.awards)) {
      if (item.month !== state.monthStartDate) continue;
      ensureMember(item.login);
      state.stats[item.login].monthlyXp += item.amount;
      state.stats[item.login].totalXp += item.amount;
    }
    recomputeScoredLines();
    rebuildScoringFeed();
  }
  await fullSync();
  res.json(getClientState());
});

// A repair preview never changes scores. Historical branch and streak bonuses
// were not itemized in old state, so excess is left untouched.
function buildRepairPreview() {
  const xp = eventXpValues();
  const rows = Object.entries(state.stats).sort(([a], [b]) => a.localeCompare(b)).map(([login, s]) => {
    const minimumXp =
      (state.scoringVersion === 2
        ? Object.values(state.scoreLedger || {}).flatMap(entry => Object.values(entry.awards)).filter(item => item.login === login && item.month === state.monthStartDate).reduce((sum, item) => sum + item.amount, 0)
        : (s.monthlyCommits || 0) * xp.commit + (s.monthlyPRsOpened || 0) * xp.prOpened + (s.monthlyPRsMerged || 0) * xp.prMerged) +
      (s.monthlyPRsReviewed || 0) * xp.prReviewed +
      (s.monthlyIssuesClosed || 0) * xp.issueClosed +
      (s.monthlyIssuesOpened || 0) * xp.issueOpened;
    return {
      login, currentMonthlyXp: s.monthlyXp, currentTotalXp: s.totalXp,
      minimumXp, safeIncrease: Math.max(0, minimumXp - s.monthlyXp),
      unverifiedExcess: Math.max(0, s.monthlyXp - minimumXp),
      counters: [s.monthlyCommits, s.monthlyPRsOpened, s.monthlyPRsMerged, s.monthlyPRsReviewed, s.monthlyIssuesClosed, s.monthlyIssuesOpened],
    };
  });
  const snapshot = createHash('sha256').update(JSON.stringify({ monthStartDate: state.monthStartDate, xp, rows })).digest('hex');
  return { snapshot, rows };
}

app.get('/api/repair/preview', requireAdmin, (_req, res) => {
  const { snapshot, rows } = buildRepairPreview();
  res.json({ token: snapshot, rows, note: 'Repair adds XP when current monthly XP is below the counter-derived minimum at current XP rates. Excess may include legitimate branch and streak bonuses.' });
});

app.post('/api/repair', requireAdmin, (req, res) => {
  const { snapshot, rows } = buildRepairPreview();
  if (req.body?.token !== snapshot) { res.status(409).json({ error: 'Preview token is missing or stale. Request a new preview.' }); return; }
  const adjustments = rows.filter(row => row.safeIncrease > 0).map(row => {
    const s = state.stats[row.login];
    s.monthlyXp += row.safeIncrease;
    s.totalXp += row.safeIncrease;
    return { login: row.login, monthlyXpBefore: row.currentMonthlyXp, monthlyXpAfter: s.monthlyXp, totalXpAfter: s.totalXp, increase: row.safeIncrease };
  });
  const ranks: Record<string, number> = {};
  rankedLogins().forEach((login, i) => { ranks[login] = i + 1; });
  state.previousRanks = ranks;
  persistState();
  broadcast('state', getClientState());
  res.json({ ok: true, adjustments });
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

// ── Custom sound clips ───────────────────────────
// Drop audio files into <data dir>/sounds (e.g. kill-1.mp3, ace.ogg) to
// replace the TV's synthesized cues. Kept out of the image and git.
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
const SOUND_EXT = /\.(mp3|ogg|wav|m4a|webm)$/i;
app.get('/api/sounds', (_req, res) => {
  try {
    const files = fs.existsSync(SOUNDS_DIR) ? fs.readdirSync(SOUNDS_DIR).filter(f => SOUND_EXT.test(f)) : [];
    res.json(Object.fromEntries(files.map(f => [f.replace(SOUND_EXT, '').toLowerCase(), `/sounds/${encodeURIComponent(f)}`])));
  } catch { res.json({}); }
});
app.use('/sounds', express.static(SOUNDS_DIR, { maxAge: '1h', fallthrough: false }));

// ── Static frontend (production / Docker) ────────
// When SERVE_STATIC=1 the backend serves the Vite build output.
// In development the Vite dev server handles the frontend separately.
if (process.env.SERVE_STATIC === '1') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Start ────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] GitArena backend running on http://0.0.0.0:${PORT}`);
  if (DEMO_MODE) {
    console.log('[server] Running in DEMO mode — GitHub polling disabled');
    return;
  }
  console.log(`[server] Org: ${GH_ORG}, repos config: ${GH_REPOS.length > 0 ? GH_REPOS.join(', ') : 'auto-discover'}`);

  // Initial full sync then start polling
  fullSync().then(() => {
    rescorePromotionPrs().catch(err => console.warn('[server] Promotion PR rescore failed:', err));
    pollCi().catch(err => console.warn('[server] CI poll failed:', err));
    setInterval(() => pollCi().catch(err => console.warn('[server] CI poll failed:', err)), 3 * 60_000);
    setInterval(() => rescorePromotionPrs().catch(() => {}), 60 * 60_000);
    pollEvents();
    setInterval(pollEvents, xpConfig.pollIntervalSeconds * 1000);
    setInterval(fullSync, xpConfig.fullSyncIntervalSeconds * 1000);
    setInterval(persistState, 30_000); // persist every 30s
  });
});
