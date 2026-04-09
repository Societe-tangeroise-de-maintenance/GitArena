# GitArena — Superprompt (React / Vite)

## Project name & description

**GitArena** — A live gamification dashboard that turns your GitHub org activity into a real-time leaderboard, streaks, badges, and boss fights displayed on a team TV screen.

---

## What we're building

A **passive TV dashboard** — always-on, no user interaction, watched from across a room. It connects live to a GitHub org via a PAT, polls for real activity, and displays a real-time gamified leaderboard with animations, rankings, streaks, badges, boss fights, and a live activity feed. The goal is to motivate the team, create friendly competition, and surface recognition moments automatically.

---

## Tech stack — React, NOT a single HTML file

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| State | Zustand |
| Animations | Framer Motion |
| Charts | Recharts |
| Fonts | Geist + Geist Mono via @fontsource |
| Package manager | npm |

**Do not use a single HTML file. Do not use vanilla JS. This is a proper React + Vite project.**

---

## Design aesthetic — Linear / Vercel / GitHub

- Background: `#0a0a0a`
- Panels: `#111111`, raised elements: `#1a1a1a`
- Borders: `rgba(255,255,255,0.06)` — barely visible
- Text: `#ededed` primary, `#888888` secondary, `#444444` tertiary
- **Geist Mono for ALL numbers, XP, timestamps, stats, rank numbers, labels**
- **Geist for names and prose only**
- No gradients anywhere — flat surfaces only
- No colored backgrounds on cards
- Color only on: type indicator bars, avatars, semantic status
- Borders are `1px`, never thicker
- Border radius: `6px` components, `8px` modals
- Designed for 1920x1080 at 2-3 meters: primary text min `14px`, names `16px`, stats `20-24px`, spotlight values `48-56px`

---

## Project structure

```
gitarena/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── config.ts
│   ├── store/
│   │   └── useStore.ts
│   ├── hooks/
│   │   ├── useGitHubPoller.ts
│   │   └── useFullSync.ts
│   ├── lib/
│   │   ├── github.ts
│   │   ├── xp.ts
│   │   ├── badges.ts
│   │   └── storage.ts
│   ├── components/
│   │   ├── layout/
│   │   │   └── TopBar.tsx
│   │   ├── leaderboard/
│   │   │   ├── Leaderboard.tsx
│   │   │   └── LeaderboardRow.tsx
│   │   ├── feed/
│   │   │   ├── ActivityFeed.tsx
│   │   │   └── FeedItem.tsx
│   │   ├── stats/
│   │   │   ├── StatsPanel.tsx
│   │   │   └── BeltPanel.tsx
│   │   ├── spotlight/
│   │   │   ├── Spotlight.tsx
│   │   │   ├── SpotlightNav.tsx
│   │   │   └── panels/
│   │   │       ├── MVPPanel.tsx
│   │   │       ├── DuelPanel.tsx
│   │   │       ├── StreakWallPanel.tsx
│   │   │       ├── BadgePanel.tsx
│   │   │       ├── FunStatPanel.tsx
│   │   │       ├── ShamePanel.tsx
│   │   │       ├── VelocityPanel.tsx
│   │   │       └── TrophyPanel.tsx
│   │   └── overlays/
│   │       ├── LevelUpOverlay.tsx
│   │       ├── BossVictoryOverlay.tsx
│   │       └── OvertakenPill.tsx
│   └── types/
│       └── index.ts
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## config.ts

```typescript
// src/config.ts
// WARNING: Do not commit your PAT to git. Add config.ts to .gitignore.

export const CONFIG = {
  pat:              'ghp_YOUR_PAT_HERE',
  org:              'your-org-name',
  repos:            [] as string[],
  pollInterval:     10,
  fullSyncInterval: 300,
  weeklyResetDay:   1,
  bossGoals: [
    { label: 'close 30 issues',  metric: 'issuesClosed' as const, target: 30  },
    { label: 'merge 20 PRs',     metric: 'prsMerged'    as const, target: 20  },
    { label: 'hit 200 commits',  metric: 'commits'      as const, target: 200 },
  ],
  spotlightInterval: 30,
};
```

Add `src/config.ts` to `.gitignore`.

---

## types/index.ts

```typescript
export interface Member {
  login: string;
  name: string;
  color: string;
}

export interface DevStats {
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

export interface FeedItem {
  id: string;
  type: 'commit' | 'pr-opened' | 'pr-merged' | 'review' | 'issue' | 'badge' | 'streak' | 'level-up';
  user: string;
  repo: string;
  message: string;
  detail: string;
  xp: number;
  time: string;
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'rare' | 'legendary';
  desc: string;
}

export interface BossGoal {
  label: string;
  metric: 'issuesClosed' | 'prsMerged' | 'commits';
  target: number;
}

export interface Belts {
  reviewer: string | null;
  closer: string | null;
  speedKing: string | null;
}

export interface ShamePR {
  title: string;
  repo: string;
  author: string;
  age: number;
}
```

---

## XP system — lib/xp.ts

```typescript
export const XP_VALUES = {
  commit: 50, prOpened: 80, prMerged: 120,
  prReviewed: 60, issueClosed: 40,
  firstCommit: 30, netNegativePR: 70, streakBonus: 200,
};

export const LEVELS = [
  { level: 1, xp: 0,     title: 'intern'    },
  { level: 2, xp: 500,   title: 'junior'    },
  { level: 3, xp: 1500,  title: 'dev'       },
  { level: 4, xp: 3000,  title: 'senior'    },
  { level: 5, xp: 6000,  title: 'staff'     },
  { level: 6, xp: 10000, title: 'principal' },
  { level: 7, xp: 16000, title: 'architect' },
  { level: 8, xp: 25000, title: 'legendary' },
];
```

---

## Badges — lib/badges.ts

```typescript
export const BADGE_DEFS: BadgeDef[] = [
  { id: 'earlyBird',    name: 'Early Bird',   icon: '🐦', rarity: 'common',    desc: 'first commit before 9am'         },
  { id: 'nightOwl',     name: 'Night Owl',    icon: '🦉', rarity: 'common',    desc: 'commit after 11pm'               },
  { id: 'quickDraw',    name: 'Quick Draw',   icon: '⚡', rarity: 'common',    desc: 'PR reviewed within 1h'           },
  { id: 'closer',       name: 'Closer',       icon: '🎯', rarity: 'common',    desc: '5 issues in a day'              },
  { id: 'surgeon',      name: 'The Surgeon',  icon: '🔪', rarity: 'rare',      desc: 'PR with >90% deletions'         },
  { id: 'streakMaster', name: 'Streak Master',icon: '🔥', rarity: 'rare',      desc: '7-day commit streak'            },
  { id: 'reviewerWeek', name: 'Top Reviewer', icon: '👁️', rarity: 'rare',      desc: 'most reviews this week'         },
  { id: 'speedDemon',   name: 'Speed Demon',  icon: '💨', rarity: 'rare',      desc: 'PR merged within 2h'            },
  { id: 'janitor',      name: 'The Janitor',  icon: '🧹', rarity: 'legendary', desc: 'delete more than add in a month'},
  { id: 'ghostSlayer',  name: 'Ghost Slayer', icon: '⚔️', rarity: 'legendary', desc: '10+ issues in a week'           },
  { id: 'ironDev',      name: 'Iron Dev',     icon: '🛡️', rarity: 'legendary', desc: '30-day commit streak'           },
  { id: 'theWall',      name: 'The Wall',     icon: '🧱', rarity: 'legendary', desc: 'no PR unreviewed >4h all week'  },
];
```

---

## GitHub data to pull

### Event stream (useGitHubPoller.ts — real-time)
- `GET /orgs/{org}/events?per_page=100`
- Use `ETag` + `If-None-Match` — 304 = no change, costs 0 rate limit
- Respect `X-Poll-Interval` response header
- Process: `PushEvent`, `PullRequestEvent`, `PullRequestReviewEvent`, `IssuesEvent`, `CreateEvent`

### Full sync (useFullSync.ts — every 5 min)
- PRs opened: `/search/issues?q=org:{org}+type:pr+created:>={date}`
- PRs merged: `/search/issues?q=org:{org}+type:pr+is:merged+closed:>={date}`
- Issues closed: `/search/issues?q=org:{org}+type:issue+is:closed+closed:>={date}`
- Open PRs no review: `/search/issues?q=org:{org}+type:pr+is:open+review:none`
- Reviews per member: `/search/issues?q=reviewed-by:{login}+type:pr+org:{org}+updated:>={date}`
- Recent commits: `/orgs/{org}/events?per_page=100`

---

## Screen layout — CSS Grid (1920×1080)

```
grid-template-columns: 360px 1fr 300px
grid-template-rows: 56px 1fr 220px

Row 1 (56px):  TopBar — full width
Row 2 (1fr):   Leaderboard | Feed | Stats+Belts
Row 3 (220px): Spotlight — full width (nav 160px + panel flex:1)
```

All separators: `1px solid rgba(255,255,255,0.06)`

---

## Leaderboard rows (68px each)

- Rank: monospace, `#1` = white, `#2/#3` = `#888`, rest = `#444`
- Avatar: 30px circle, colored bg, monospace initials, subtle breathe animation
- Name (14px 500 weight) + level title (10px mono muted) + 1px progress bar
- Streak: 10px mono, amber color — only shown if active
- XP: 14px mono right-aligned + "xp" label 10px muted
- Ghost: opacity 0.22 + grayscale if no activity 3+ days
- On new XP: `+{n}` floats up and fades (Framer Motion)

---

## Activity feed items

Each item (min 50px height):
- 2px left bar: blue=commit, purple=pr-opened, green=pr-merged, teal=review, amber=issue, white=badge/level-up, red=streak
- 26px avatar circle
- Name (bold 13px) + action text / detail line (11px mono muted) / repo
- XP (11px green) + timestamp (10px mono muted) — right side

---

## Spotlight — 8 panels, auto-rotates every 30s

| Mode key | Nav label | Content |
|---|---|---|
| mvp | mvp | Large avatar, name, level, 5 stats (commits, merged, reviews, issues, streak) |
| duel | duel | #1 vs #2 split bar, XP counts, percentage |
| streaks | streaks | Grid of active streaks — avatar + name + day count |
| badge | badge | Large icon, badge name, rarity tag, earner name, description |
| funStat | fun stat | 52px monospace number + 16px label |
| shame | needs review | Cards with red top border — PR title, repo, author, hours waiting |
| velocity | velocity | Recharts BarChart of commits per day this week |
| trophies | trophies | Grid of earned badges — icon, name, owner |

Left nav shows 8 dots, active one is a white pill. Inactive are dark circles.

---

## Overlay animations (Framer Motion AnimatePresence)

| Event | Overlay |
|---|---|
| Level up | Full screen scrim + centered card: "level up" eyebrow + name + new title. 5s. |
| Boss defeated | Full screen scrim + centered card + CSS confetti. 7s. |
| Badge earned | Full screen: large icon + name + rarity + earner. 5s. |
| Rank overtaken | Pill slides down from top of screen. 3s. |

---

## Idle animations (always running)

- Avatar breathe: `scale(1) → scale(1.018)`, 5s loop
- Last-commit clock in topbar: green < 30m, amber 30-120m, red > 120m
- Spotlight: `fadeIn` on each panel rotation (0.4s)
- Leaderboard row on new XP: green flash background, `+XP` float

---

## Demo mode

Detected when `CONFIG.pat === 'ghp_YOUR_PAT_HERE'`. Loads:
- 6 members: Alae, Yassine, Mehdi, Sara, Karim, Nadia
- Repos: 7odor, api-server, frontend, mobile
- Pre-seeded feed with realistic commit messages
- Boss at ~45% progress
- Karim as ghost (no activity 4 days)
- `demoTick()` every 7-12s simulates live events

---

## Persistence (lib/storage.ts + localStorage)

Persists across page refreshes:
- `devStats` — XP, streaks, badges
- `bossProgress` + `bossIndex`
- `previousRanks`
- `belts`
- `weekStart` — detect Monday reset, wipe weekly fields, keep badges/streaks/trophies

---

## Tailwind config extensions

```js
theme: {
  extend: {
    colors: {
      bg:      '#0a0a0a',
      panel:   '#111111',
      raised:  '#1a1a1a',
      muted:   '#222222',
      t1:      '#ededed',
      t2:      '#888888',
      t3:      '#444444',
      green:   '#22c55e',
      blue:    '#3b82f6',
      purple:  '#a78bfa',
      amber:   '#f59e0b',
      red:     '#ef4444',
      teal:    '#14b8a6',
    },
    fontFamily: {
      mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      sans: ['Geist', 'system-ui', 'sans-serif'],
    },
  }
}
```

---

## Bootstrap commands

```bash
npm create vite@latest gitarena -- --template react-ts
cd gitarena
npm install zustand framer-motion recharts
npm install tailwindcss @tailwindcss/vite
npm install @fontsource/geist @fontsource/geist-mono
npx tailwindcss init
```

Add to `vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite'
plugins: [react(), tailwindcss()]
```

Add to `src/main.tsx`:
```ts
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
```

---

## Implementation order

1. Scaffold + install deps
2. `config.ts` + `.gitignore`
3. `types/index.ts`
4. `lib/xp.ts` + `lib/badges.ts` + `lib/github.ts` + `lib/storage.ts`
5. `store/useStore.ts`
6. `tailwind.config.ts` + global CSS
7. `App.tsx` — grid layout shell
8. `TopBar.tsx`
9. `LeaderboardRow.tsx` + `Leaderboard.tsx`
10. `FeedItem.tsx` + `ActivityFeed.tsx`
11. `StatsPanel.tsx` + `BeltPanel.tsx`
12. All 8 spotlight panel components
13. `Spotlight.tsx` + `SpotlightNav.tsx`
14. `useGitHubPoller.ts` + `useFullSync.ts`
15. Overlay components
16. Demo mode + demoTick
17. Idle animations + polish
