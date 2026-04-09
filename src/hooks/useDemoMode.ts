import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { XP_VALUES } from '../lib/xp';
import type { Member } from '../types';

const DEMO_MEMBERS: Member[] = [
  { login: 'alae',    name: 'Alae',    color: '#3b82f6', avatarUrl: '' },
  { login: 'yassine', name: 'Yassine', color: '#a78bfa', avatarUrl: '' },
  { login: 'mehdi',   name: 'Mehdi',   color: '#22c55e', avatarUrl: '' },
  { login: 'sara',    name: 'Sara',    color: '#f59e0b', avatarUrl: '' },
  { login: 'karim',   name: 'Karim',   color: '#ef4444', avatarUrl: '' },
  { login: 'nadia',   name: 'Nadia',   color: '#14b8a6', avatarUrl: '' },
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

    setMembers(DEMO_MEMBERS);

    // Pre-seed stats
    setTimeout(() => {
      const store = useStore.getState();

      // Seed each member with initial data
      const seedData: Record<string, { commits: number; prs: number; reviews: number; issues: number; xp: number; streak: number }> = {
        alae:    { commits: 42, prs: 8, reviews: 12, issues: 6, xp: 3800, streak: 5 },
        yassine: { commits: 35, prs: 6, reviews: 15, issues: 4, xp: 3200, streak: 3 },
        mehdi:   { commits: 28, prs: 5, reviews: 8,  issues: 7, xp: 2600, streak: 7 },
        sara:    { commits: 22, prs: 4, reviews: 10, issues: 3, xp: 2100, streak: 2 },
        karim:   { commits: 3,  prs: 1, reviews: 2,  issues: 0, xp: 400,  streak: 0 },
        nadia:   { commits: 18, prs: 3, reviews: 6,  issues: 5, xp: 1800, streak: 4 },
      };

      for (const [login, data] of Object.entries(seedData)) {
        const s = { ...store.stats[login] };
        s.weeklyXp = data.xp;
        s.totalXp = data.xp + randInt(500, 3000);
        s.weeklyCommits = data.commits;
        s.weeklyPRsMerged = data.prs;
        s.weeklyPRsReviewed = data.reviews;
        s.weeklyIssuesClosed = data.issues;
        s.weeklyPRsOpened = data.prs + randInt(0, 3);
        s.weeklyLinesAdded = data.commits * randInt(20, 80);
        s.weeklyLinesDeleted = data.commits * randInt(5, 30);
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
      store.stats.alae.badges = ['earlyBird', 'quickDraw', 'streakMaster'];
      store.stats.mehdi.badges = ['nightOwl', 'closer', 'ghostSlayer'];
      store.stats.yassine.badges = ['quickDraw', 'reviewerWeek'];
      store.stats.sara.badges = ['earlyBird'];
      store.stats.nadia.badges = ['surgeon', 'speedDemon'];

      useStore.setState({ stats: { ...store.stats } });

      // Boss ~45%
      setBossProgress('issuesClosed', 14);
      setBossProgress('prsMerged', 9);
      setBossProgress('commits', 90);

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
        speedKing: 'alae',
      });

      // Seed feed
      const types: Array<'commit' | 'pr-merged' | 'pr-opened' | 'review' | 'issue'> = [
        'commit', 'commit', 'commit', 'pr-merged', 'pr-opened', 'review', 'issue',
      ];
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
        addXp(member.login, 0, type, repo, msg); // xp 0 since pre-seeded
      }
    }, 100);
  }, [isDemo, setMembers, addXp, setBossProgress, setShamePRs, setBelts, incrementStat, bumpStreak, awardBadge]);

  // Demo tick — simulate live events every 7-12s
  useEffect(() => {
    if (!isDemo) return;

    function demoTick() {
      const member = pick(DEMO_MEMBERS.filter(m => m.login !== 'karim'));
      const repo = pick(REPOS);
      const roll = Math.random();

      if (roll < 0.45) {
        // Commit
        const msg = pick(COMMIT_MESSAGES);
        addXp(member.login, XP_VALUES.commit, 'commit', repo, 'pushed 1 commit', msg);
        incrementStat(member.login, 'weeklyCommits');
        incrementStat(member.login, 'dailyCommits');
        bumpStreak(member.login);
      } else if (roll < 0.60) {
        // PR opened
        const title = pick(PR_TITLES);
        addXp(member.login, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title);
        incrementStat(member.login, 'weeklyPRsOpened');
      } else if (roll < 0.75) {
        // PR merged
        const title = pick(PR_TITLES);
        addXp(member.login, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title);
        incrementStat(member.login, 'weeklyPRsMerged');
      } else if (roll < 0.88) {
        // Review
        addXp(member.login, XP_VALUES.prReviewed, 'review', repo, 'reviewed PR');
        incrementStat(member.login, 'weeklyPRsReviewed');
      } else {
        // Issue closed
        const title = pick(ISSUE_TITLES);
        addXp(member.login, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', title);
        incrementStat(member.login, 'weeklyIssuesClosed');
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
