<div align="center">

# 🏟️ GitArena

**A live arena for GitHub activity, designed for your team's office TV.**

[![CI](https://github.com/Societe-tangeroise-de-maintenance/GitArena/actions/workflows/ci.yml/badge.svg)](https://github.com/Societe-tangeroise-de-maintenance/GitArena/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)

[**Live Demo →**](https://demo.gitarena.pro) &nbsp;·&nbsp; [Report Bug](https://github.com/Societe-tangeroise-de-maintenance/GitArena/issues) &nbsp;·&nbsp; [Request Feature](https://github.com/Societe-tangeroise-de-maintenance/GitArena/issues)

</div>

---

## What is GitArena?

GitArena checks GitHub activity every 30 seconds and turns eligible code changes, PRs, reviews, and issues into XP. It runs on a single server and displays a glanceable **1920×1080 dashboard** on a TV or monitor in your office.

**Key features:**

- 🏆 **Live leaderboard** — monthly XP ranking plus a scrolling full roster
- 🔥 **Streaks** — daily activity streaks with milestone bonuses
- 🎖️ **Badges** — automatically awarded (ghostSlayer, closer, ironDev, streakMaster…)
- 👾 **Boss fights** — team-wide goals (close 30 issues, merge 20 PRs, hit 200 commits)
- 📡 **Real-time** — Server-Sent Events push every event instantly
- 🎬 **Game-style moments** — animated scores, rank changes, achievements, and team victories
- 🔊 **Optional sound** — a startup sound choice with a persistent mute control
- 🌟 **Spotlight panels** — rotate through trophy, velocity, streak wall, duel, and fun stats
- 🎭 **Demo mode** — runs without a GitHub token for presentations and screenshots
- 🔧 **Hot-reload config** — edit `xp-config.json` to tune XP values live, no restart needed

---

## Quick Start

### Option A — Docker (recommended for production)

```bash
# 1. Clone
git clone https://github.com/Societe-tangeroise-de-maintenance/GitArena.git
cd gitarena

# 2. Configure
cp .env.example .env
#    Edit .env → set GITARENA_PAT and GITARENA_ORG

# 3. Run
docker-compose up --build
```

Open **http://localhost:3002** on the TV browser.

---

### Option B — npm (development / local)

```bash
# 1. Clone & setup
git clone https://github.com/Societe-tangeroise-de-maintenance/GitArena.git
cd gitarena
bash scripts/setup.sh   # interactive wizard: creates .env and src/config.ts

# 2. Start
npm start               # runs backend (port 3002) + Vite dev server (port 5173)
```

Open **http://localhost:5173** in your browser.
Vite also binds to `0.0.0.0`, so a TV on the same local network can open `http://<your-computer-LAN-IP>:5173`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITARENA_PAT` | ✅ | GitHub Personal Access Token (`read:org` + `repo` scopes) |
| `GITARENA_ORG` | ✅ | GitHub organisation slug (e.g. `my-company`) |
| `GITARENA_REPOS` | — | Comma-separated repo names to watch. Empty = auto-discover all org repos |
| `PORT` | — | Backend port (default: `3002`) |
| `GITARENA_DATA_DIR` | — | Directory for persistent server state. Defaults to `data/` in production and the project root in development |
| `GITARENA_ADMIN_SECRET` | — | If set, the recalculation and repair endpoints require an `X-Admin-Secret` header matching this value |
| `SERVE_STATIC` | — | Set to `1` to have the backend serve the built frontend (used by Docker) |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser / TV  (React 18 + Vite + Tailwind)          │
│                                                      │
│  Leaderboard │ Activity Feed │ Spotlight Panels      │
│  Boss Fight  │ Overlays      │ Stats / Belts         │
└──────────────────────┬───────────────────────────────┘
                       │  SSE + REST  (port 3002)
┌──────────────────────▼───────────────────────────────┐
│  Backend  (Express + tsx)                            │
│                                                      │
│  pollEvents()  ←  GitHub Events API  (every 30s)   │
│  fullSync()    ←  GitHub Search API  (every 15min)  │
│                                                      │
│  State persisted to server-state.json every 30s      │
└──────────────────────────────────────────────────────┘
```

**Tech stack:** React 18 · Vite · TypeScript · Tailwind CSS v3 · Zustand · Framer Motion · Express · tsx

---

## XP System

| Action | XP |
|---|---|
| Eligible code changes | Up to +100 per PR diff or direct default-branch commit |
| Open PR | Up to +10, scaled to the eligible diff |
| Merge PR | Up to +40, scaled to the eligible diff |
| Review PR | +60 |
| Close issue | +40 |
| Open issue | +20 |
| Create branch | +30 |
| Streak milestone (3/5/7/10/14/21/30 days) | +200 |

Code XP depends on eligible changed lines and files. A diff of at least 100 changed lines across at least three files receives the full award; lines determine 75% of the scale and files 25%. Generated directories, lockfiles and minified assets listed in `xp-config.json` do not count. Opening a PR gives provisional code and opening XP. Updating its diff adjusts those awards; closing it without merging removes them. Merge XP goes to the merger, while code XP is split among commit authors by eligible contribution. A commit associated with a PR is not also paid as a direct push. Reviews, issues, branches and streaks keep their configured rates.

Pushing to a feature branch updates commit counters and appears in Recent Activity as **Pending PR** or **Linked PR**. Code XP is awarded when that branch has an open PR and can stay at the 100 XP cap after later pushes. Direct pushes to the default branch are scored immediately. The server checks recently pushed repositories and their branch heads each minute; GitHub's event feed provides additional reconciliation when it catches up.

The `scoring` block in `xp-config.json` controls the diff formula and file exclusions. The zero `commit`, `prOpened` and `prMerged` flat rates in `xpValues` are intentional. `legacyXpValues` is used only before migration of an existing state file.

The leaderboard and counters reset at the start of each UTC month. Historical total XP is preserved when an existing installation migrates. To convert the current month after updating an existing installation, send an admin-authorized `POST /api/scoring/migrate`. It fetches the current month's PR and default-branch diffs, checks that the old counter-based portion can be replaced safely, then updates the month in one operation. It returns an error without changing scores if GitHub data is incomplete. The endpoint is idempotent after a successful migration.

### Score repair

`GET /api/repair/preview` returns a report and snapshot token without changing scores. Send that token as `{ "token": "..." }` to `POST /api/repair` to fill shortfalls below the counter-derived XP at the current rates. When `GITARENA_ADMIN_SECRET` is configured, both routes require `X-Admin-Secret`. Historical branch and streak bonuses cannot always be reconstructed, so excess XP is reported without automatic removal.

---

## Demo Mode

GitArena has a built-in demo mode with randomised live events — no GitHub token required. To enable it, set `pat` to any non-empty string in `src/config.ts`:

```ts
// src/config.ts
export const CONFIG = { pat: 'demo', org: '', repos: [] };
```

Then run `npm run dev` — you'll see a fully animated dashboard with fake team members and live activity. To run the backend and frontend together in demo mode, use `GITARENA_PAT=demo npm start`.

---

## Deployment Tips

- **TV kiosk**: open in Chrome/Chromium with `--kiosk --start-fullscreen` flags
- **Port 80/443**: put nginx in front of port 3002 with a proxy_pass
- **Persistent state**: mount the container working directory as a Docker volume so `server-state.json` survives restarts

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs, issues, and ideas are welcome.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and how to contribute.

## License

MIT © 2026 STM Societe Tangeroise de Maintenance
