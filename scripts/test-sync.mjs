// Test script that simulates the fullSync logic using Search API
import { readFileSync } from 'fs';

// Read PAT from config
const configContent = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
const patMatch = configContent.match(/pat:\s*'([^']+)'/);
const orgMatch = configContent.match(/org:\s*'([^']+)'/);
const PAT = patMatch?.[1];
const ORG = orgMatch?.[1];
if (!PAT || !ORG) { console.error('Could not read PAT/ORG from config.ts'); process.exit(1); }

const h = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${PAT}` };
const ws = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })();
const XP = { commit: 50, prOpened: 80, prMerged: 120, issueClosed: 40 };

async function run() {
  console.log(`=== Simulating fullSync (Search API) for ${ORG} since ${ws} ===\n`);

  // 1. Commits
  const cRes = await fetch(`https://api.github.com/search/commits?q=${encodeURIComponent(`org:${ORG} committer-date:>=${ws}`)}&per_page=100`, { headers: h });
  console.log('Commits search status:', cRes.status);
  const cData = await cRes.json();
  const commitsByUser = {};
  for (const c of (cData.items || [])) {
    const login = c.author?.login || c.committer?.login;
    if (!login) continue;
    commitsByUser[login] = (commitsByUser[login] || 0) + 1;
  }
  const knownCommits = Object.values(commitsByUser).reduce((a, b) => a + b, 0);
  console.log(`  Total: ${cData.total_count}, by known users: ${knownCommits}`);

  // 2. PRs created
  const pRes = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(`org:${ORG} type:pr created:>=${ws}`)}&per_page=100`, { headers: h });
  console.log('PRs search status:', pRes.status);
  const pData = await pRes.json();
  const prOpensByUser = {};
  const prMergesByUser = {};
  for (const pr of (pData.items || [])) {
    const login = pr.user?.login;
    if (!login) continue;
    prOpensByUser[login] = (prOpensByUser[login] || 0) + 1;
    if (pr.pull_request?.merged_at) prMergesByUser[login] = (prMergesByUser[login] || 0) + 1;
  }
  console.log(`  Created: ${pData.total_count}, merged: ${Object.values(prMergesByUser).reduce((a, b) => a + b, 0)}`);

  // 3. Issues closed
  const iRes = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(`org:${ORG} type:issue is:closed closed:>=${ws}`)}&per_page=100`, { headers: h });
  console.log('Issues closed status:', iRes.status);
  const iData = await iRes.json();
  const issuesClosedByUser = {};
  for (const iss of (iData.items || [])) {
    const login = iss.user?.login;
    if (!login) continue;
    issuesClosedByUser[login] = (issuesClosedByUser[login] || 0) + 1;
  }
  console.log(`  Closed: ${iData.total_count}`);

  // Calculate XP
  const all = new Set([
    ...Object.keys(commitsByUser),
    ...Object.keys(prOpensByUser),
    ...Object.keys(prMergesByUser),
    ...Object.keys(issuesClosedByUser),
  ]);

  console.log('\n=== Expected XP from Search API ===');
  const rankings = [];
  for (const login of all) {
    const c = commitsByUser[login] || 0;
    const po = prOpensByUser[login] || 0;
    const pm = prMergesByUser[login] || 0;
    const ic = issuesClosedByUser[login] || 0;
    const xp = c * XP.commit + po * XP.prOpened + pm * XP.prMerged + ic * XP.issueClosed;
    rankings.push({ login, xp, c, po, pm, ic });
  }
  rankings.sort((a, b) => b.xp - a.xp);
  for (const r of rankings) {
    console.log(`  #${rankings.indexOf(r)+1} ${r.login}: ${r.xp} XP (commits:${r.c} pr-open:${r.po} pr-merge:${r.pm} issue-close:${r.ic})`);
  }

  const totalXP = rankings.reduce((a, r) => a + r.xp, 0);
  console.log(`\n  Total XP: ${totalXP} across ${rankings.length} users`);
  console.log(`  ${rankings.filter(r => r.xp > 0).length} users have XP > 0`);

  // Rate limit check
  const rate = await fetch('https://api.github.com/rate_limit', { headers: h });
  const rd = await rate.json();
  console.log('\n=== Rate limits after sync ===');
  console.log(`  Search: ${rd.resources.search.remaining}/${rd.resources.search.limit}`);
  console.log(`  Core: ${rd.resources.core.remaining}/${rd.resources.core.limit}`);

  // Verify
  const pass = rankings.length > 0 && rankings[0].xp > 0;
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}: Search-based sync ${pass ? 'produces valid data' : 'returns no data'}`);
}

run().catch(e => console.error('FAILED:', e));
