import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { CONFIG } from '../config';
import { fetchRepoEvents, fetchOrgRepos, fetchOrgEvents, fetchRepoRecentActivity, isBot, monthStart } from '../lib/github';
import { XP_VALUES } from '../lib/xp';

export function useGitHubPoller() {
  const isDemo = useStore((s) => s.isDemo);
  const addXp = useStore((s) => s.addXp);
  const incrementStat = useStore((s) => s.incrementStat);
  const bumpStreak = useStore((s) => s.bumpStreak);
  const ensureMember = useStore((s) => s.ensureMember);
  const etagsRef = useRef<Record<string, string | undefined>>({});
  const seenIds = useRef(new Set<string>());
  const reposRef = useRef<string[]>([]);
  const startTimeRef = useRef(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()); // 2h ago

  // Restore seenIds from localStorage to avoid re-processing events after reload
  useEffect(() => {
    try {
      const raw = localStorage.getItem('gitarena_seenIds');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) arr.forEach((id: string) => seenIds.current.add(id));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isDemo) return;

    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const instanceId = Math.random().toString(36).slice(2, 6);

    async function init() {
      // Get repos list (use config.repos if set, otherwise fetch all)
      if (CONFIG.repos.length > 0) {
        reposRef.current = CONFIG.repos;
      } else {
        try {
          reposRef.current = await fetchOrgRepos();
        } catch {
          reposRef.current = [];
        }
      }
      if (stopped) { console.log(`[GitArena:${instanceId}] stopped before poll`); return; }
      console.log(`[GitArena:${instanceId}] Polling ${reposRef.current.length} repos`);
      poll();
    }

    async function poll() {
      if (stopped) return;
      const repos = reposRef.current;
      let eventsProcessed = 0;

      // Also try org events
      try {
        const orgResult = await fetchOrgEvents(etagsRef.current['__org__']);
        etagsRef.current['__org__'] = orgResult.etag;
        if (!orgResult.notModified) {
          for (const event of orgResult.events) {
            if (seenIds.current.has(event.id)) continue;
            seenIds.current.add(event.id);
            processEvent(event);
            eventsProcessed++;
          }
        }
      } catch (err) { console.warn('[GitArena] org events error:', err); }

      // Poll each repo (limit to 20 most recently pushed to save rate limit)
      const reposToCheck = repos.slice(0, 20);
      for (const repo of reposToCheck) {
        if (stopped) return;
        try {
          const result = await fetchRepoEvents(repo, etagsRef.current[repo]);
          etagsRef.current[repo] = result.etag;
          if (!result.notModified) {
            for (const event of result.events) {
              if (seenIds.current.has(event.id)) continue;
              seenIds.current.add(event.id);
              processEvent(event);
              eventsProcessed++;
            }
          }
        } catch (err) { console.warn(`[GitArena] ${repo} events error:`, err); }
      }

      // Supplementary: fetch recent issues/PRs directly (real-time, no Events API delay)
      for (const repo of reposToCheck) {
        if (stopped) return;
        try {
          const items = await fetchRepoRecentActivity(repo, startTimeRef.current);
          for (const item of items) {
            processIssueOrPR(item, repo);
          }
        } catch { /* ignore */ }
      }

      console.log(`[GitArena:${instanceId}] Poll done: ${eventsProcessed} events processed, seenIds=${seenIds.current.size}`);

      // Keep seen set manageable & persist
      if (seenIds.current.size > 2000) {
        const arr = [...seenIds.current];
        seenIds.current = new Set(arr.slice(-1000));
      }
      try {
        localStorage.setItem('gitarena_seenIds', JSON.stringify([...seenIds.current]));
      } catch { /* ignore */ }

      // Refresh startTime so long-running sessions keep getting recent data
      startTimeRef.current = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      if (!stopped) {
        timer = setTimeout(poll, CONFIG.pollInterval * 1000);
      }
    }

    function processIssueOrPR(item: Record<string, unknown>, repo: string) {
      const user = item.user as Record<string, string> | undefined;
      const login = user?.login;
      const avatarUrl = user?.avatar_url || '';
      if (!login || isBot(login)) return;

      const isPR = !!item.pull_request;
      const state = item.state as string;
      const title = (item.title as string) || '';
      const createdAt = item.created_at as string;
      const closedAt = item.closed_at as string | null;
      const merged = isPR && !!(item.pull_request as Record<string, unknown>)?.merged_at;

      // Skip items from before current month
      const ms = monthStart();
      const latestTime = closedAt || createdAt;
      if (latestTime && latestTime < ms) return;

      ensureMember(login, avatarUrl);

      if (isPR) {
        // PR opened
        const openKey = `rt-pr-open-${repo}-${item.number}`;
        if (!seenIds.current.has(openKey)) {
          seenIds.current.add(openKey);
          addXp(login, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title, createdAt);
          incrementStat(login, 'weeklyPRsOpened');
        }
        // PR merged
        if (merged && closedAt) {
          const mergeKey = `rt-pr-merge-${repo}-${item.number}`;
          if (!seenIds.current.has(mergeKey)) {
            seenIds.current.add(mergeKey);
            addXp(login, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title, closedAt);
            incrementStat(login, 'weeklyPRsMerged');
          }
        }
      } else {
        // Issue opened
        const openKey = `rt-issue-open-${repo}-${item.number}`;
        if (!seenIds.current.has(openKey)) {
          seenIds.current.add(openKey);
          addXp(login, XP_VALUES.issueOpened, 'issue-opened', repo, 'opened issue', title, createdAt);
        }
        // Issue closed
        if (state === 'closed' && closedAt) {
          const closeKey = `rt-issue-close-${repo}-${item.number}`;
          if (!seenIds.current.has(closeKey)) {
            seenIds.current.add(closeKey);
            addXp(login, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', title, closedAt);
            incrementStat(login, 'weeklyIssuesClosed');
            incrementStat(login, 'dailyIssuesClosed');
          }
        }
      }
    }

    function processEvent(event: Record<string, unknown>) {
      const actorObj = event.actor as Record<string, string>;
      const actor = actorObj?.login;
      const avatarUrl = actorObj?.avatar_url || '';
      const repo = ((event.repo as Record<string, string>)?.name || '').split('/').pop() || '';
      const type = event.type as string;
      const payload = event.payload as Record<string, unknown>;
      const eventTime = (event.created_at as string) || undefined;

      if (!actor || isBot(actor)) return;

      // Skip events from before current month
      if (eventTime && eventTime < monthStart()) return;

      // Register member with avatar
      ensureMember(actor, avatarUrl);

      switch (type) {
        case 'PushEvent': {
          const commits = (payload.commits as Array<Record<string, string>>) || [];
          const count = commits.length;
          // Cap XP at 10 commits per push to prevent inflated scores from large pushes
          const cappedCount = Math.min(count, 10);
          if (count > 0) {
            const msg = commits[0]?.message?.split('\n')[0] || 'pushed code';
            addXp(actor, XP_VALUES.commit * cappedCount, 'commit', repo, `pushed ${count} commit${count > 1 ? 's' : ''}`, msg, eventTime);
            incrementStat(actor, 'weeklyCommits', count);
            incrementStat(actor, 'dailyCommits', count);
            bumpStreak(actor);
          } else {
            // PushEvent with empty commits array (force push, squash merge, etc.)
            addXp(actor, XP_VALUES.commit, 'commit', repo, 'pushed code', undefined, eventTime);
            incrementStat(actor, 'weeklyCommits', 1);
            incrementStat(actor, 'dailyCommits', 1);
            bumpStreak(actor);
          }
          break;
        }
        case 'CreateEvent': {
          const refType = payload.ref_type as string;
          if (refType === 'branch') {
            addXp(actor, XP_VALUES.firstCommit, 'commit', repo, `created branch ${(payload.ref as string) || ''}`, undefined, eventTime);
          }
          break;
        }
        case 'PullRequestEvent': {
          const action = (payload.action as string);
          const pr = payload.pull_request as Record<string, unknown>;
          const title = (pr?.title as string) || 'PR';
          const prNum = pr?.number as number;
          if (action === 'opened') {
            const key = `rt-pr-open-${repo}-${prNum}`;
            if (!seenIds.current.has(key)) {
              seenIds.current.add(key);
              addXp(actor, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title, eventTime);
              incrementStat(actor, 'weeklyPRsOpened');
            }
          } else if (action === 'closed' && pr?.merged) {
            const key = `rt-pr-merge-${repo}-${prNum}`;
            if (!seenIds.current.has(key)) {
              seenIds.current.add(key);
              addXp(actor, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title, eventTime);
              incrementStat(actor, 'weeklyPRsMerged');
            }
          }
          break;
        }
        case 'PullRequestReviewEvent': {
          const reviewPr = payload.pull_request as Record<string, unknown>;
          const reviewId = (payload.review as Record<string, unknown>)?.id || event.id;
          const key = `rt-review-${repo}-${reviewId}`;
          if (!seenIds.current.has(key)) {
            seenIds.current.add(key);
            addXp(actor, XP_VALUES.prReviewed, 'review', repo, 'reviewed PR', (reviewPr?.title as string) || '', eventTime);
            incrementStat(actor, 'weeklyPRsReviewed');
          }
          break;
        }
        case 'IssuesEvent': {
          const action = payload.action as string;
          const issue = payload.issue as Record<string, unknown>;
          const title = (issue?.title as string) || '';
          const issueNum = issue?.number as number;
          if (action === 'opened') {
            const key = `rt-issue-open-${repo}-${issueNum}`;
            if (!seenIds.current.has(key)) {
              seenIds.current.add(key);
              addXp(actor, XP_VALUES.issueOpened, 'issue-opened', repo, 'opened issue', title, eventTime);
            }
          } else if (action === 'closed') {
            const key = `rt-issue-close-${repo}-${issueNum}`;
            if (!seenIds.current.has(key)) {
              seenIds.current.add(key);
              addXp(actor, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', title, eventTime);
              incrementStat(actor, 'weeklyIssuesClosed');
              incrementStat(actor, 'dailyIssuesClosed');
            }
          }
          break;
        }
      }
    }

    init();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isDemo, addXp, incrementStat, bumpStreak, ensureMember]);
}
