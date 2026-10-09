// Frontend config — copy this file to src/config.ts and fill in your values.
// IMPORTANT: src/config.ts is gitignored. Never commit your PAT.
//
// For self-hosted deployments, all that matters is:
//   - GITARENA_PAT and GITARENA_ORG in your .env file (used by the backend)
//   - The frontend reads config from /api/state served by the backend
//
// The `pat` and `org` fields below are only used in DEMO MODE
// (when no backend is reachable). Set pat to a non-empty placeholder
// string to force demo mode during development without a real org.

export const CONFIG = {
  // Leave empty to connect to a real backend (set GITARENA_PAT on the server).
  // Set to any non-empty string (e.g. 'demo') to enable built-in demo mode.
  pat: '',

  // Your GitHub organisation slug — only used by the backend via GITARENA_ORG.
  // The frontend reads the live org from /api/state.
  org: '',

  repos:            [] as string[],
  pollInterval:     10,
  fullSyncInterval: 300,
  bossGoals: [
    { label: 'close 30 issues',  metric: 'issuesClosed' as const, target: 30  },
    { label: 'merge 20 PRs',     metric: 'prsMerged'    as const, target: 20  },
    { label: 'hit 200 commits',  metric: 'commits'      as const, target: 200 },
  ],
  spotlightInterval: 30,
};
