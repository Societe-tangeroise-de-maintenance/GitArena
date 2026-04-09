#!/usr/bin/env node
/**
 * GitArena Quick Check
 * 
 * Verifies the GitHub API is accessible and returns expected data.
 * Run with: node scripts/quick-check.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function check() {
  const h = { 'Authorization': `Bearer ${PAT}`, 'Accept': 'application/vnd.github+json' };

  // 1. Rate limit
  const rl = await (await fetch(`${BASE}/rate_limit`, { headers: h })).json();
  const core = rl.resources.core;
  console.log(`Rate limit: ${core.remaining}/${core.limit}`);
  if (core.remaining < 100) {
    console.error('⚠ Low rate limit! Events polling will fail.');
  }

  // 2. Org repos
  const repos = await (await fetch(`${BASE}/orgs/${ORG}/repos?per_page=10&sort=pushed`, { headers: h })).json();
  console.log(`Repos: ${repos.length} (showing top 10 by push date)`);

  // 3. Check events for top 3 repos
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  
  let totalApril = 0;
  const userXp = {};
  
  for (const repo of repos.slice(0, 10)) {
    const events = await (await fetch(`${BASE}/repos/${ORG}/${repo.name}/events?per_page=100`, { headers: h })).json();
    if (!Array.isArray(events)) continue;
    
    const april = events.filter(e => e.created_at >= monthStart);
    totalApril += april.length;
    
    for (const e of april) {
      const actor = e.actor?.login;
      if (!actor || actor.endsWith('[bot]') || actor === 'coderabbitai') continue;
      userXp[actor] = (userXp[actor] || 0) + 1;
    }
  }
  
  console.log(`\nApril events (top 10 repos): ${totalApril}`);
  console.log('Active users:');
  Object.entries(userXp)
    .sort((a, b) => b[1] - a[1])
    .forEach(([user, count]) => console.log(`  ${user}: ${count} events`));
  
  if (totalApril === 0) {
    console.error('\n❌ No April events found! Check PAT permissions and org name.');
  } else {
    console.log('\n✅ API data looks good. Events should show up in the app.');
  }
}

check().catch(err => { console.error('Error:', err); process.exit(1); });
