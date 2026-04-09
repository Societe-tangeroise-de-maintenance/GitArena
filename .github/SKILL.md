---
applyTo: "**"
---

# MergeGlory Development & Testing Protocol

## MANDATORY: Test Every Change

Before committing or deploying ANY code change, you MUST:

### 1. Run the Data Flow Test
```bash
node scripts/test-data-flow.mjs
```
This test:
- Fetches real data from the GitHub API
- Simulates the exact same processing logic as `useGitHubPoller`
- Validates XP calculations, feed items, and rankings
- Must show **0 FAILED** tests

### 2. Run TypeScript Check
```bash
npx tsc --noEmit
```
Must produce **zero errors**.

### 3. Run Production Build
```bash
npx vite build
```
Must succeed without errors (chunk size warnings are OK).

### 4. Run Quick API Check
```bash
node scripts/quick-check.mjs
```
Validates the GitHub API is accessible and returning data.

### 5. Verify in Browser
After starting the dev server (`npx vite --host 0.0.0.0 --port 5173`):
- Open the browser console (F12) and check for `[GitArena]` log messages
- Wait at least 15 seconds for the first poll cycle to complete
- Verify: `__gitarena.getRanking()` shows users with XP > 0
- Verify: `__gitarena.getFeed()` shows recent feed items
- Check the leaderboard shows ranked users with XP
- Check the activity feed shows recent events

## Browser Debug Tools

The app exposes `window.__gitarena` with these methods:
- `__gitarena.getState()` — Full Zustand store state
- `__gitarena.getStats()` — All user stats objects
- `__gitarena.getRanking()` — Ranked list of users with XP
- `__gitarena.getFeed()` — Latest 10 feed items
- `__gitarena.forceReset()` — Clear all localStorage and reload (nuclear option)

## Architecture Notes

### Data Flow
```
GitHub Events API → useGitHubPoller.processEvent() → useStore.addXp() → stats + feed
GitHub Issues API → useGitHubPoller.processIssueOrPR() → useStore.addXp() → stats + feed
GitHub Search API → useFullSync.sync() → boss progress + belts
```

### Key Files
- `src/hooks/useGitHubPoller.ts` — Main event polling and processing
- `src/store/useStore.ts` — Zustand state management
- `src/lib/github.ts` — GitHub API helpers + `monthStart()`
- `src/lib/storage.ts` — localStorage persistence (schema versioned)
- `src/lib/xp.ts` — XP values and level definitions

### Critical Behaviors
- **Monthly XP reset**: `monthStart()` returns `YYYY-MM-01`. Events before this date are filtered out.
- **Dedup keys**: All PR/issue dedup keys include repo name: `rt-pr-open-${repo}-${number}`
- **Feed ordering**: Feed is sorted by time descending, then sliced to 50 items (newest 50 kept)
- **Schema version**: Bumping `SCHEMA_VERSION` in `storage.ts` wipes all stored data. Only do this when data format changes.
- **SeenIds**: Stored separately in `gitarena_seenIds` localStorage key. Cleared alongside main state.
- **StrictMode**: Removed to prevent double-effect execution in development that can cause race conditions with async polling.

### Common Pitfalls
- **String comparison for dates**: `eventTime < monthStart()` works because ISO 8601 strings sort lexicographically. But `monthStart()` has no time component (`2026-04-01`), so `2026-04-01T00:00:00Z` is NOT less than `2026-04-01`.
- **Push events with 0 commits**: GitHub Events API often returns PushEvents with empty `commits` array (force push, squash). Code must handle this (awards 50 XP for the push itself).
- **Bot filtering**: `isBot()` checks username suffix `[bot]` and `-bot`, plus explicit list. `coderabbitai` is in the list.
- **Poller timing**: First poll cycle takes 10-20 seconds (fetches repos list + events for 20 repos sequentially). The UI shows "waiting for events" during this time.
- **Schema bump side effects**: Bumping schema clears ALL data including seenIds. The next poll will re-process all available events from the API (last ~100 per repo).
