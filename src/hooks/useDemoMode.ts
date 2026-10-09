import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { XP_VALUES } from '../lib/xp';
import type { FeedItem, Member } from '../types';

function buildDemoAvatar(name: string, color: string): string {
  const initials = name
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${color}"/><text x="64" y="72" text-anchor="middle" font-family="monospace" font-size="44" fill="#0b0f14" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_MEMBERS: Member[] = [
  { login: 'alice',   name: 'Alice',   color: '#3b82f6', avatarUrl: buildDemoAvatar('Alice', '#3b82f6') },
  { login: 'yassine', name: 'Yassine', color: '#a78bfa', avatarUrl: buildDemoAvatar('Yassine', '#a78bfa') },
  { login: 'mehdi',   name: 'Mehdi',   color: '#22c55e', avatarUrl: buildDemoAvatar('Mehdi', '#22c55e') },
  { login: 'sara',    name: 'Sara',    color: '#f59e0b', avatarUrl: buildDemoAvatar('Sara', '#f59e0b') },
  { login: 'karim',   name: 'Karim',   color: '#ef4444', avatarUrl: buildDemoAvatar('Karim', '#ef4444') },
  { login: 'nadia',   name: 'Nadia',   color: '#14b8a6', avatarUrl: buildDemoAvatar('Nadia', '#14b8a6') },
];

const REPOS = ['7odor', 'api-server', 'frontend', 'mobile'];

const COMMIT_MESSAGES = [
  'fix: resolve auth token refresh loop',
  'feat: add dark mode toggle',
  'refactor: extract validation utils',
  'chore: update deps to latest',
  'fix: handle null pointer in parser',
  'feat: implement search autocomplete',
  'perf: lazy load dashboard charts',
  'fix: correct timezone offset calc',
  'style: align header spacing',
  'feat: add webhook retry logic',
  'fix: race condition in cache invalidation',
  'docs: update API endpoint docs',
  'feat: add CSV export for reports',
  'fix: memory leak in event listener',
  'refactor: simplify middleware chain',
];

const PR_TITLES = [
  'Add user role management',
  'Implement rate limiting middleware',
  'Fix pagination off-by-one error',
  'Refactor database connection pool',
  'Add integration tests for auth flow',
  'Migrate to new payment provider',
  'Optimize image upload pipeline',
  'Fix CORS headers for API v2',
];

const ISSUE_TITLES = [
  'Login fails on Safari',
  'Dashboard slow with 1000+ records',
  'Missing validation on email field',
  'Incorrect total in invoice summary',
  'Memory spike during PDF generation',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function useDemoMode() {
  const isDemo = useStore((s) => s.isDemo);
  const setMembers = useStore((s) => s.setMembers);
  const addXp = useStore((s) => s.addXp);
  const incrementStat = useStore((s) => s.incrementStat);
  const bumpStreak = useStore((s) => s.bumpStreak);
  const awardBadge = useStore((s) => s.awardBadge);
  const setBossProgress = useStore((s) => s.setBossProgress);
  const setShamePRs = useStore((s) => s.setShamePRs);
  const setBelts = useStore((s) => s.setBelts);
  const seeded = useRef(false);

  // Initial seed
  useEffect(() => {
    if (!isDemo || seeded.current) return;
    seeded.current = true;

    // Pre-seed stats
    setTimeout(() => {
      setMembers(DEMO_MEMBERS);
      const store = useStore.getState();

      // Seed each member with initial data
      const seedData: Record<string, { commits: number; prs: number; reviews: number; issues: number; streak: number }> = {
        alice:   { commits: 42, prs: 8, reviews: 12, issues: 6, streak: 5 },
        yassine: { commits: 35, prs: 6, reviews: 15, issues: 4, streak: 3 },
        mehdi:   { commits: 28, prs: 5, reviews: 8,  issues: 7, streak: 7 },
        sara:    { commits: 22, prs: 4, reviews: 10, issues: 3, streak: 2 },
        karim:   { commits: 3,  prs: 1, reviews: 2,  issues: 0, streak: 0 },
        nadia:   { commits: 18, prs: 3, reviews: 6,  issues: 5, streak: 4 },
      };

      for (const [login, data] of Object.entries(seedData)) {
        const s = { ...store.stats[login] };
        s.monthlyCommits = data.commits;
        s.monthlyPRsMerged = data.prs;
        s.monthlyPRsReviewed = data.reviews;
        s.monthlyIssuesClosed = data.issues;
        s.monthlyPRsOpened = data.prs + 2;
        s.monthlyXp =
          s.monthlyCommits * XP_VALUES.commit +
          s.monthlyPRsOpened * XP_VALUES.prOpened +
          s.monthlyPRsMerged * XP_VALUES.prMerged +
          s.monthlyPRsReviewed * XP_VALUES.prReviewed +
          s.monthlyIssuesClosed * XP_VALUES.issueClosed;
        s.totalXp = s.monthlyXp + 1200;
        s.monthlyLinesAdded = data.commits * randInt(20, 80);
        s.monthlyLinesDeleted = data.commits * randInt(5, 30);
        s.dailyCommits = randInt(1, 8);
        s.dailyIssuesClosed = randInt(0, 3);
        s.streak = data.streak;
        s.longestStreak = Math.max(data.streak, randInt(3, 14));
        s.streakLastDate = data.streak > 0 ? new Date().toISOString().split('T')[0] : null;
        s.lastActivityTime = login === 'karim'
          ? new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() - randInt(0, 60) * 60_000).toISOString();
        s.lastCommitDate = s.lastActivityTime;
        store.stats[login] = s;
      }

      // Seed badges
      store.stats.alice.badges = ['earlyBird', 'quickDraw', 'streakMaster'];
      store.stats.mehdi.badges = ['nightOwl', 'closer', 'ghostSlayer'];
      store.stats.yassine.badges = ['quickDraw', 'reviewerWeek'];
      store.stats.sara.badges = ['earlyBird'];
      store.stats.nadia.badges = ['surgeon', 'speedDemon'];

      useStore.setState({ stats: { ...store.stats } });

      // Boss ~45%
      if (new URLSearchParams(window.location.search).get('panel') === 'voyage') {
        useStore.setState({ bossProgress: Object.fromEntries(store.bossGoals.map(g => [g.metric, g.target * .18])) });
      } else {
        setBossProgress('issuesClosed', 14);
        setBossProgress('prsMerged', 9);
        setBossProgress('commits', 90);
      }

      // Shame PRs
      setShamePRs([
        { title: 'Add webhook retry logic', repo: 'api-server', author: 'karim', age: 48 },
        { title: 'Fix flaky test in CI', repo: 'frontend', author: 'mehdi', age: 24 },
        { title: 'Update env config docs', repo: '7odor', author: 'sara', age: 12 },
      ]);

      // Belts
      setBelts({
        reviewer: 'yassine',
        closer: 'mehdi',
        speedKing: 'alice',
      });

      // Seed feed
      const types: Array<'commit' | 'pr-merged' | 'pr-opened' | 'review' | 'issue'> = [
        'commit', 'commit', 'commit', 'pr-merged', 'pr-opened', 'review', 'issue',
      ];
      const seedFeed: FeedItem[] = [];
      for (let i = 0; i < 15; i++) {
        const member = pick(DEMO_MEMBERS.filter(m => m.login !== 'karim'));
        const type = pick(types);
        const repo = pick(REPOS);
        const msg = type === 'commit'
          ? pick(COMMIT_MESSAGES)
          : type === 'pr-merged' || type === 'pr-opened'
            ? pick(PR_TITLES)
            : type === 'issue'
              ? pick(ISSUE_TITLES)
              : 'reviewed PR';
        const action = type === 'commit' ? 'shipped a commit' : type === 'pr-merged' ? 'merged PR' : type === 'pr-opened' ? 'opened PR' : type === 'issue' ? 'closed issue' : 'reviewed PR';
        const xp = type === 'commit' ? XP_VALUES.commit : type === 'pr-merged' ? XP_VALUES.prMerged : type === 'pr-opened' ? XP_VALUES.prOpened : type === 'issue' ? XP_VALUES.issueClosed : XP_VALUES.prReviewed;
        seedFeed.push({ id: `demo-seed-${i}`, type, user: member.login, repo, message: action, detail: msg, xp, time: new Date(Date.now() - i * 4 * 60_000).toISOString() });
      }
      useStore.setState({ feed: seedFeed });
    }, 100);
  }, [isDemo, setMembers, addXp, setBossProgress, setShamePRs, setBelts, incrementStat, bumpStreak, awardBadge]);

  // An explicit voyage preview runs a repeatable fake mission locally.
  useEffect(() => {
    if (!isDemo || new URLSearchParams(window.location.search).get('panel') !== 'voyage') return;
    const stages = [
      { percent: 18, type: 'commit' as const, damage: false },
      { percent: 25, type: 'pr-merged' as const, damage: false },
      { percent: 28, type: 'review' as const, damage: false },
      { percent: 32, type: 'commit' as const, damage: true },
      { percent: 36, type: 'pr-merged' as const, damage: false },
      { percent: 50, type: 'commit' as const, damage: false },
      { percent: 56, type: 'review' as const, damage: false },
      { percent: 61, type: 'pr-merged' as const, damage: false },
      { percent: 75, type: 'commit' as const, damage: true },
      { percent: 81, type: 'review' as const, damage: false },
      { percent: 86, type: 'pr-merged' as const, damage: false },
      { percent: 100, type: 'commit' as const, damage: false },
    ];
    let index = 0;
    const step = () => {
      const stage = stages[index++ % stages.length];
      const state = useStore.getState();
      const event: FeedItem = { id: `voyage-demo-${Date.now()}`, type: stage.type, user: 'alice', repo: 'api-server', message: stage.type === 'review' ? 'reviewed PR' : stage.type === 'pr-merged' ? 'merged PR' : 'pushed a commit', detail: 'Voyage simulation', xp: 0, time: new Date().toISOString() };
      useStore.setState({
        bossProgress: Object.fromEntries(state.bossGoals.map(g => [g.metric, g.target * stage.percent / 100])),
        ciAlerts: stage.damage ? [{ repo: 'api-server', branch: 'staging', failing: true, workflow: 'Build', url: '', since: event.time }] : [],
        feed: [event, ...state.feed].slice(0, 50),
      });
    };
    const start = setTimeout(step, 500);
    const timer = setInterval(step, 8000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [isDemo]);

  // Demo tick — simulate live events every 7-12s
  useEffect(() => {
    if (!isDemo || new URLSearchParams(window.location.search).get('panel') === 'voyage') return;

    function demoTick() {
      const member = pick(DEMO_MEMBERS.filter(m => m.login !== 'karim'));
      const repo = pick(REPOS);
      const roll = Math.random();

      if (roll < 0.45) {
        // Commit
        const msg = pick(COMMIT_MESSAGES);
        addXp(member.login, XP_VALUES.commit, 'commit', repo, 'pushed 1 commit', msg);
        incrementStat(member.login, 'monthlyCommits');
        incrementStat(member.login, 'dailyCommits');
        bumpStreak(member.login);
      } else if (roll < 0.60) {
        // PR opened
        const title = pick(PR_TITLES);
        addXp(member.login, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title);
        incrementStat(member.login, 'monthlyPRsOpened');
      } else if (roll < 0.75) {
        // PR merged
        const title = pick(PR_TITLES);
        addXp(member.login, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title);
        incrementStat(member.login, 'monthlyPRsMerged');
      } else if (roll < 0.88) {
        // Review
        addXp(member.login, XP_VALUES.prReviewed, 'review', repo, 'reviewed PR');
        incrementStat(member.login, 'monthlyPRsReviewed');
      } else {
        // Issue closed
        const title = pick(ISSUE_TITLES);
        addXp(member.login, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', title);
        incrementStat(member.login, 'monthlyIssuesClosed');
        incrementStat(member.login, 'dailyIssuesClosed');
      }

      // Occasionally award a badge
      if (Math.random() < 0.05) {
        const badges = ['earlyBird', 'nightOwl', 'quickDraw', 'closer', 'surgeon', 'streakMaster', 'speedDemon'];
        awardBadge(member.login, pick(badges));
      }
    }

    const schedule = () => {
      const delay = randInt(7000, 12000);
      return setTimeout(() => {
        demoTick();
        timerRef.current = schedule();
      }, delay);
    };

    const timerRef = { current: schedule() };
    return () => clearTimeout(timerRef.current);
  }, [isDemo, addXp, incrementStat, bumpStreak, awardBadge]);
}
