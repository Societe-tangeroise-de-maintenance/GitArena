#!/usr/bin/env node
/**
 * GitArena Data Flow Test
 * 
 * Tests the actual GitHub API -> processing logic -> XP calculation pipeline.
 * Run with: node scripts/test-data-flow.mjs
 * 
 * This script:
 * 1. Fetches real data from the GitHub API
 * 2. Simulates the exact same processing logic as useGitHubPoller
 * 3. Validates that XP, feed items, and rankings are produced correctly
 * 4. Reports any issues found
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read PAT from config.ts
function readPat() {
  try {
    const config = readFileSync(resolve(__dirname, '../src/config.ts'), 'utf8');
    const match = config.match(/pat:\s*'([^']+)'/);
    return match ? match[1] : null;
  } catch { return null; }
}

const PAT = process.env.GITHUB_PAT || readPat();
if (!PAT) { console.error('❌ No PAT found'); process.exit(1); }

const ORG = 'Societe-tangeroise-de-maintenance';
const BASE = 'https://api.github.com';

// ── Constants (mirrored from src/lib/xp.ts) ──
const XP_VALUES = {
  commit: 50, prOpened: 80, prMerged: 120, prReviewed: 60,
  issueClosed: 40, issueOpened: 20, firstCommit: 30,
  netNegativePR: 70, streakBonus: 200,
};

const BOT_LOGINS = new Set(['coderabbitai', 'copilot', 'dependabot[bot]', 'github-actions[bot]', 'renovate[bot]', 'codecov[bot]']);
function isBot(login) {
  return BOT_LOGINS.has(login) || login.endsWith('[bot]') || login.endsWith('-bot');
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── API helpers ──
function headers(etag) {
  const h = { 'Authorization': `Bearer ${PAT}`, 'Accept': 'application/vnd.github+json' };
  if (etag) h['If-None-Match'] = etag;
  return h;
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  return { ok: true, status: res.status, data: await res.json() };
}

// ── Simulated state ──
const stats = {};
const feed = [];
const seenIds = new Set();
let errors = [];
let warnings = [];

function emptyStats(login) {
  return { login, weeklyXp: 0, totalXp: 0, weeklyCommits: 0, weeklyPRsOpened: 0, weeklyPRsMerged: 0, weeklyPRsReviewed: 0, weeklyIssuesClosed: 0 };
}

function ensureStats(login) {
  if (!stats[login]) stats[login] = emptyStats(login);
}

function addXp(login, amount, type, repo, message, detail, eventTime) {
  if (isBot(login)) return;
  ensureStats(login);
  stats[login].weeklyXp += amount;
  stats[login].totalXp += amount;
  feed.push({ type, user: login, repo, message, detail: detail || '', xp: amount, time: eventTime || new Date().toISOString() });
}

function incrementStat(login, field, delta = 1) {
  ensureStats(login);
  stats[login][field] = (stats[login][field] || 0) + delta;
}

// ── Processing logic (mirrors useGitHubPoller.ts exactly) ──
function processEvent(event) {
  const actorObj = event.actor;
  const actor = actorObj?.login;
  const avatarUrl = actorObj?.avatar_url || '';
  const repo = (event.repo?.name || '').split('/').pop() || '';
  const type = event.type;
  const payload = event.payload || {};
  const eventTime = event.created_at || undefined;

  if (!actor || isBot(actor)) return 'skipped:bot';

  // Skip events from before current month
  if (eventTime && eventTime < monthStart()) return 'skipped:before-month';

  ensureStats(actor);

  switch (type) {
    case 'PushEvent': {
      const commits = payload.commits || [];
      const count = commits.length;
      const cappedCount = Math.min(count, 10);
      if (count > 0) {
        const msg = commits[0]?.message?.split('\n')[0] || 'pushed code';
        addXp(actor, XP_VALUES.commit * cappedCount, 'commit', repo, `pushed ${count} commit${count > 1 ? 's' : ''}`, msg, eventTime);
        incrementStat(actor, 'weeklyCommits', count);
      } else {
        addXp(actor, XP_VALUES.commit, 'commit', repo, 'pushed code', undefined, eventTime);
        incrementStat(actor, 'weeklyCommits', 1);
      }
      return 'processed:push';
    }
    case 'CreateEvent': {
      if (payload.ref_type === 'branch') {
        addXp(actor, XP_VALUES.firstCommit, 'commit', repo, `created branch ${payload.ref || ''}`, undefined, eventTime);
        return 'processed:create-branch';
      }
      return 'skipped:create-non-branch';
    }
    case 'PullRequestEvent': {
      const action = payload.action;
      const pr = payload.pull_request || {};
      const title = pr.title || 'PR';
      const prNum = pr.number;
      if (action === 'opened') {
        const key = `rt-pr-open-${repo}-${prNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title, eventTime);
          incrementStat(actor, 'weeklyPRsOpened');
          return 'processed:pr-opened';
        }
        return 'skipped:dedup';
      } else if (action === 'closed' && pr.merged) {
        const key = `rt-pr-merge-${repo}-${prNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title, eventTime);
          incrementStat(actor, 'weeklyPRsMerged');
          return 'processed:pr-merged';
        }
        return 'skipped:dedup';
      }
      return 'skipped:pr-other-action';
    }
    case 'PullRequestReviewEvent': {
      const reviewId = payload.review?.id || event.id;
      const key = `rt-review-${repo}-${reviewId}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        addXp(actor, XP_VALUES.prReviewed, 'review', repo, 'reviewed PR', payload.pull_request?.title || '', eventTime);
        incrementStat(actor, 'weeklyPRsReviewed');
        return 'processed:review';
      }
      return 'skipped:dedup';
    }
    case 'IssuesEvent': {
      const action = payload.action;
      const issue = payload.issue || {};
      const title = issue.title || '';
      const issueNum = issue.number;
      if (action === 'opened') {
        const key = `rt-issue-open-${repo}-${issueNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, XP_VALUES.issueOpened, 'issue-opened', repo, 'opened issue', title, eventTime);
          return 'processed:issue-opened';
        }
        return 'skipped:dedup';
      } else if (action === 'closed') {
        const key = `rt-issue-close-${repo}-${issueNum}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          addXp(actor, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', title, eventTime);
          incrementStat(actor, 'weeklyIssuesClosed');
          return 'processed:issue-closed';
        }
        return 'skipped:dedup';
      }
      return `skipped:issue-action-${action}`;
    }
    default:
      return `skipped:unhandled-${type}`;
  }
}

function processIssueOrPR(item, repo) {
  const login = item.user?.login;
  if (!login || isBot(login)) return 'skipped:bot';

  const isPR = !!item.pull_request;
  const state = item.state;
  const title = item.title || '';
  const createdAt = item.created_at;
  const closedAt = item.closed_at;
  const merged = isPR && !!item.pull_request?.merged_at;

  const ms = monthStart();
  const latestTime = closedAt || createdAt;
  if (latestTime && latestTime < ms) return 'skipped:before-month';

  ensureStats(login);

  if (isPR) {
    const openKey = `rt-pr-open-${repo}-${item.number}`;
    if (!seenIds.has(openKey)) {
      seenIds.add(openKey);
      addXp(login, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title, createdAt);
      incrementStat(login, 'weeklyPRsOpened');
    }
    if (merged && closedAt) {
      const mergeKey = `rt-pr-merge-${repo}-${item.number}`;
      if (!seenIds.has(mergeKey)) {
        seenIds.add(mergeKey);
        addXp(login, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title, closedAt);
        incrementStat(login, 'weeklyPRsMerged');
      }
    }
    return 'processed:pr';
  } else {
    const openKey = `rt-issue-open-${repo}-${item.number}`;
    if (!seenIds.has(openKey)) {
      seenIds.add(openKey);
      addXp(login, XP_VALUES.issueOpened, 'issue-opened', repo, 'opened issue', title, createdAt);
    }
    if (state === 'closed' && closedAt) {
      const closeKey = `rt-issue-close-${repo}-${item.number}`;
      if (!seenIds.has(closeKey)) {
        seenIds.add(closeKey);
        addXp(login, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', title, closedAt);
        incrementStat(login, 'weeklyIssuesClosed');
      }
    }
    return 'processed:issue';
  }
}

// ── Tests ──
async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GitArena Data Flow Test                ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();

  if (!PAT) {
    // Try to read from config.ts
    const fs = await import('fs');
    try {
      const config = fs.readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
      const match = config.match(/pat:\s*'([^']+)'/);
      if (match) {
        Object.defineProperty(globalThis, 'PAT_OVERRIDE', { value: match[1] });
      }
    } catch {}
  }
  
  const token = globalThis.PAT_OVERRIDE || PAT;
  if (!token) {
    console.error('❌ No PAT found. Set GITHUB_PAT env or check src/config.ts');
    process.exit(1);
  }

  // Monkey-patch the module-level PAT for API calls
  // (hacky but we're just testing)
  const origHeaders = headers;

  const passed = [];
  const failed = [];

  function assert(name, condition, detail) {
    if (condition) {
      passed.push(name);
      console.log(`  ✅ ${name}`);
    } else {
      failed.push(name);
      console.log(`  ❌ ${name}: ${detail}`);
    }
  }

  // Test 1: monthStart() returns correct format
  console.log('── Test: monthStart() ──');
  const ms = monthStart();
  assert('monthStart format', /^\d{4}-\d{2}-01$/.test(ms), `got "${ms}"`);
  assert('monthStart is current month', ms.startsWith('2026-04'), `got "${ms}"`);
  console.log(`  ℹ monthStart() = "${ms}"`);
  console.log();

  // Test 2: String comparison works for month filtering
  console.log('── Test: Month filter string comparison ──');
  assert('April event passes', !('2026-04-09T13:48:26Z' < ms), 'April 9 should NOT be filtered');
  assert('March event blocked', '2026-03-28T10:00:00Z' < ms, 'March 28 should be filtered');
  assert('April 1 event passes', !('2026-04-01T00:00:00Z' < ms), 'April 1 should NOT be filtered');
  assert('March 31 event blocked', '2026-03-31T23:59:59Z' < ms, 'March 31 should be filtered');
  
  // Test the EXACT string comparison the code does
  const testEventTime = '2026-04-09T13:48:26Z';
  const filterResult = testEventTime && testEventTime < ms;
  assert('Real filter logic', !filterResult, `"${testEventTime}" < "${ms}" = ${filterResult}, should be false`);
  console.log();

  // Test 3: Fetch org repos
  console.log('── Test: Fetch org repos ──');
  const reposResult = await fetchJSON(`${BASE}/orgs/${encodeURIComponent(ORG)}/repos?per_page=100&sort=pushed`);
  assert('Repos fetch succeeds', reposResult.ok, `HTTP ${reposResult.status}`);
  const repos = reposResult.ok ? reposResult.data.map(r => r.name) : [];
  assert('Repos found', repos.length > 0, `got ${repos.length}`);
  console.log(`  ℹ Found ${repos.length} repos: ${repos.slice(0, 5).join(', ')}${repos.length > 5 ? '...' : ''}`);
  console.log();

  // Test 4: Fetch and process events from each repo
  console.log('── Test: Process repo events (Events API) ──');
  const eventsPerRepo = {};
  let totalEvents = 0;
  let totalAprilEvents = 0;
  let processedResults = {};
  
  const reposToCheck = repos.slice(0, 20);
  for (const repo of reposToCheck) {
    const result = await fetchJSON(`${BASE}/repos/${encodeURIComponent(ORG)}/${encodeURIComponent(repo)}/events?per_page=100`);
    if (!result.ok) {
      warnings.push(`Failed to fetch events for ${repo}: HTTP ${result.status}`);
      continue;
    }
    const events = result.data;
    if (!Array.isArray(events)) continue;
    
    let repoCount = 0;
    for (const event of events) {
      totalEvents++;
      // Simulate the poll loop dedup by event.id
      const eventId = String(event.id);
      if (seenIds.has(eventId)) continue;
      seenIds.add(eventId);
      
      const result = processEvent(event);
      repoCount++;
      processedResults[result] = (processedResults[result] || 0) + 1;
      if (event.created_at >= ms) totalAprilEvents++;
    }
    eventsPerRepo[repo] = repoCount;
  }

  console.log(`  ℹ Total events from API: ${totalEvents}`);
  console.log(`  ℹ April events: ${totalAprilEvents}`);
  console.log(`  ℹ Processing results: ${JSON.stringify(processedResults, null, 2)}`);
  assert('Events fetched', totalEvents > 0, `got ${totalEvents}`);
  assert('April events found', totalAprilEvents > 0, `got ${totalAprilEvents}`);
  console.log();

  // Test 5: Process supplementary Issues API
  console.log('── Test: Process supplementary Issues API ──');
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  let issueApiItems = 0;
  for (const repo of reposToCheck.slice(0, 5)) {
    const result = await fetchJSON(`${BASE}/repos/${encodeURIComponent(ORG)}/${encodeURIComponent(repo)}/issues?state=all&sort=updated&direction=desc&since=${encodeURIComponent(since)}&per_page=30`);
    if (!result.ok) continue;
    const items = result.data;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      processIssueOrPR(item, repo);
      issueApiItems++;
    }
  }
  console.log(`  ℹ Supplementary items: ${issueApiItems}`);
  console.log();

  // Test 6: Verify XP was awarded
  console.log('── Test: XP Awards ──');
  const rankedUsers = Object.values(stats)
    .filter(s => s.weeklyXp > 0)
    .sort((a, b) => b.weeklyXp - a.weeklyXp);

  assert('Some users have XP', rankedUsers.length > 0, `${rankedUsers.length} users with XP`);
  
  console.log(`  ℹ Rankings:`);
  for (const s of rankedUsers) {
    console.log(`    #${rankedUsers.indexOf(s) + 1} ${s.login}: ${s.weeklyXp} XP (commits:${s.weeklyCommits}, PRs opened:${s.weeklyPRsOpened}, PRs merged:${s.weeklyPRsMerged}, issues closed:${s.weeklyIssuesClosed})`);
  }
  console.log();

  // Test 7: Verify feed was populated
  console.log('── Test: Feed ──');
  assert('Feed has items', feed.length > 0, `got ${feed.length} items`);
  
  // Test feed sorting
  const sortedFeed = [...feed].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const slicedFeed = sortedFeed.slice(0, 50);
  
  if (slicedFeed.length > 0) {
    const newest = slicedFeed[0];
    const oldest = slicedFeed[slicedFeed.length - 1];
    console.log(`  ℹ Feed: ${feed.length} total items, keeping newest 50`);
    console.log(`  ℹ Newest: "${newest.message}" by ${newest.user} at ${newest.time}`);
    console.log(`  ℹ Oldest: "${oldest.message}" by ${oldest.user} at ${oldest.time}`);
    
    // Verify newest item is from April
    assert('Newest feed item is from April', newest.time >= ms, `newest time: ${newest.time}`);
  }
  console.log();

  // Test 8: Verify dedup works
  console.log('── Test: Dedup ──');
  console.log(`  ℹ SeenIds count: ${seenIds.size}`);
  // Check for repo-scoped keys
  const rtKeys = [...seenIds].filter(k => k.startsWith('rt-'));
  const hasRepoScope = rtKeys.every(k => {
    // Should be like rt-pr-open-REPONAME-123
    const parts = k.split('-');
    return parts.length >= 4; // rt, type, action, repo, number
  });
  assert('RT keys are repo-scoped', rtKeys.length === 0 || hasRepoScope, `found ${rtKeys.length} rt keys`);
  console.log();

  // Summary
  console.log('══════════════════════════════════════════');
  console.log(`  PASSED: ${passed.length}  FAILED: ${failed.length}`);
  if (warnings.length > 0) {
    console.log(`  WARNINGS: ${warnings.length}`);
    warnings.forEach(w => console.log(`    ⚠ ${w}`));
  }
  if (failed.length > 0) {
    console.log('  FAILURES:');
    failed.forEach(f => console.log(`    ❌ ${f}`));
  }
  console.log('══════════════════════════════════════════');
  process.exit(failed.length > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
