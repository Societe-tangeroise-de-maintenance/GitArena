#!/usr/bin/env node
// Audit live server state vs. expected XP from per-user counters.
// Usage:
//   node scripts/audit-xp.mjs [http://host:port]
// Defaults to http://localhost:3002.

const base = process.argv[2] || process.env.GITARENA_URL || 'http://localhost:3002';

const res = await fetch(`${base}/api/state`);
if (!res.ok) {
  console.error(`GET /api/state failed: ${res.status}`);
  process.exit(1);
}
const state = await res.json();
const xp = state.xpConfig.xpValues;

const rows = [];
for (const [login, s] of Object.entries(state.stats)) {
  const counterXp =
    s.monthlyCommits * xp.commit +
    s.monthlyPRsOpened * xp.prOpened +
    s.monthlyPRsMerged * xp.prMerged +
    s.monthlyPRsReviewed * xp.prReviewed +
    s.monthlyIssuesClosed * xp.issueClosed +
    (s.monthlyIssuesOpened || 0) * xp.issueOpened;
  const shortfall = Math.max(0, counterXp - s.monthlyXp);
  const excess = Math.max(0, s.monthlyXp - counterXp);
  rows.push({
    login,
    monthlyXp: s.monthlyXp,
    counterXp,
    shortfall,
    excess,
    commits: s.monthlyCommits,
    prsOpen: s.monthlyPRsOpened,
    prsMerge: s.monthlyPRsMerged,
    issuesClose: s.monthlyIssuesClosed,
    issuesOpen: s.monthlyIssuesOpened || 0,
    reviews: s.monthlyPRsReviewed,
  });
}

rows.sort((a, b) => b.shortfall - a.shortfall || a.login.localeCompare(b.login));

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('login', 24), pad('monthlyXp', 10), pad('counterXp', 10), pad('shortfall', 10), pad('excess', 10), 'counters');
console.log('-'.repeat(110));
for (const r of rows) {
  console.log(
    pad(r.login, 24),
    pad(r.monthlyXp, 10),
    pad(r.counterXp, 10),
    pad(r.shortfall, 10),
    pad(r.excess, 10),
    `c=${r.commits} pO=${r.prsOpen} pM=${r.prsMerge} iC=${r.issuesClose} iO=${r.issuesOpen} rv=${r.reviews}`,
  );
}

const shortfalls = rows.filter(r => r.shortfall > 0);
if (shortfalls.length) {
  console.log(`\n${shortfalls.length} counter-derived XP shortfall(s) at current XP rates.`);
  process.exit(2);
}
console.log('\nOK: no counter-derived XP shortfalls. Excess may include branch and streak bonuses.');
