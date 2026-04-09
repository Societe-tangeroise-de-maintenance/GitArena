import { CONFIG } from '../config';

const BASE = 'https://api.github.com';

function headers(etag?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${CONFIG.pat}`,
  };
  if (etag) h['If-None-Match'] = etag;
  return h;
}

export async function fetchOrgEvents(etag?: string) {
  const res = await fetch(`${BASE}/orgs/${encodeURIComponent(CONFIG.org)}/events?per_page=100`, {
    headers: headers(etag),
  });
  const pollInterval = parseInt(res.headers.get('X-Poll-Interval') || '10', 10);
  if (res.status === 304) {
    return { events: [], etag, pollInterval, notModified: true };
  }
  const events = await res.json();
  const newEtag = res.headers.get('ETag') || etag;
  return { events: Array.isArray(events) ? events : [], etag: newEtag, pollInterval, notModified: false };
}

// Fetch events from a single repo
export async function fetchRepoEvents(repo: string, etag?: string) {
  const res = await fetch(
    `${BASE}/repos/${encodeURIComponent(CONFIG.org)}/${encodeURIComponent(repo)}/events?per_page=100`,
    { headers: headers(etag) },
  );
  const pollInterval = parseInt(res.headers.get('X-Poll-Interval') || '10', 10);
  if (res.status === 304) {
    return { events: [], etag, pollInterval, notModified: true };
  }
  const events = await res.json();
  const newEtag = res.headers.get('ETag') || etag;
  return { events: Array.isArray(events) ? events : [], etag: newEtag, pollInterval, notModified: false };
}

// Fetch list of org repos (sorted by most recently pushed)
export async function fetchOrgRepos(): Promise<string[]> {
  const res = await fetch(
    `${BASE}/orgs/${encodeURIComponent(CONFIG.org)}/repos?per_page=100&sort=pushed`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const repos = await res.json();
  if (!Array.isArray(repos)) return [];
  return repos.map((r: Record<string, string>) => r.name);
}

export async function searchIssues(query: string) {
  const res = await fetch(`${BASE}/search/issues?q=${encodeURIComponent(query)}&per_page=100`, {
    headers: headers(),
  });
  const data = await res.json();
  return data.items || [];
}

// Bot accounts to exclude
const BOT_LOGINS = new Set(['coderabbitai', 'copilot', 'dependabot[bot]', 'github-actions[bot]', 'renovate[bot]', 'codecov[bot]']);
export function isBot(login: string): boolean {
  return BOT_LOGINS.has(login) || login.endsWith('[bot]') || login.endsWith('-bot');
}

// Fetch all org members + outside collaborators (includes avatar_url, filters bots)
export async function fetchOrgMembers(): Promise<Array<{ login: string; name: string; avatarUrl: string }>> {
  const results: Array<{ login: string; name: string; avatarUrl: string }> = [];
  const seen = new Set<string>();

  // Fetch org members
  const membersRes = await fetch(`${BASE}/orgs/${encodeURIComponent(CONFIG.org)}/members?per_page=100`, {
    headers: headers(),
  });
  if (membersRes.ok) {
    const members = await membersRes.json();
    if (Array.isArray(members)) {
      for (const m of members) {
        if (!isBot(m.login) && !seen.has(m.login)) {
          seen.add(m.login);
          results.push({ login: m.login, name: m.login, avatarUrl: m.avatar_url || '' });
        }
      }
    }
  }

  // Fetch outside collaborators
  const collabRes = await fetch(`${BASE}/orgs/${encodeURIComponent(CONFIG.org)}/outside_collaborators?per_page=100`, {
    headers: headers(),
  });
  if (collabRes.ok) {
    const collabs = await collabRes.json();
    if (Array.isArray(collabs)) {
      for (const m of collabs) {
        if (!isBot(m.login) && !seen.has(m.login)) {
          seen.add(m.login);
          results.push({ login: m.login, name: m.login, avatarUrl: m.avatar_url || '' });
        }
      }
    }
  }

  return results;
}

export function weekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}
