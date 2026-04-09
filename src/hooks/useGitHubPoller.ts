import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { CONFIG } from '../config';
import { fetchRepoEvents, fetchOrgRepos, fetchOrgEvents, isBot } from '../lib/github';
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

  useEffect(() => {
    if (isDemo) return;

    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

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
      console.log('[GitArena] Polling', reposRef.current.length, 'repos:', reposRef.current.slice(0, 5).join(', '), reposRef.current.length > 5 ? '...' : '');
      poll();
    }

    async function poll() {
      if (stopped) return;
      const repos = reposRef.current;

      // Also try org events
      try {
        const orgResult = await fetchOrgEvents(etagsRef.current['__org__']);
        etagsRef.current['__org__'] = orgResult.etag;
        if (!orgResult.notModified) {
          for (const event of orgResult.events) {
            if (seenIds.current.has(event.id)) continue;
            seenIds.current.add(event.id);
            processEvent(event);
          }
        }
      } catch { /* ignore */ }

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
            }
          }
        } catch { /* ignore individual repo errors */ }
      }

      // Keep seen set manageable
      if (seenIds.current.size > 2000) {
        const arr = [...seenIds.current];
        seenIds.current = new Set(arr.slice(-1000));
      }

      if (!stopped) {
        timer = setTimeout(poll, CONFIG.pollInterval * 1000);
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

      // Register member with avatar
      ensureMember(actor, avatarUrl);

      switch (type) {
        case 'PushEvent': {
          const commits = (payload.commits as Array<Record<string, string>>) || [];
          const count = commits.length;
          if (count > 0) {
            const msg = commits[0]?.message?.split('\n')[0] || 'pushed code';
            addXp(actor, XP_VALUES.commit * count, 'commit', repo, `pushed ${count} commit${count > 1 ? 's' : ''}`, msg, eventTime);
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
          if (action === 'opened') {
            addXp(actor, XP_VALUES.prOpened, 'pr-opened', repo, 'opened PR', title, eventTime);
            incrementStat(actor, 'weeklyPRsOpened');
          } else if (action === 'closed' && pr?.merged) {
            addXp(actor, XP_VALUES.prMerged, 'pr-merged', repo, 'merged PR', title, eventTime);
            incrementStat(actor, 'weeklyPRsMerged');
          }
          break;
        }
        case 'PullRequestReviewEvent': {
          addXp(actor, XP_VALUES.prReviewed, 'review', repo, 'reviewed PR', undefined, eventTime);
          incrementStat(actor, 'weeklyPRsReviewed');
          break;
        }
        case 'IssuesEvent': {
          if ((payload.action as string) === 'closed') {
            addXp(actor, XP_VALUES.issueClosed, 'issue', repo, 'closed issue', undefined, eventTime);
            incrementStat(actor, 'weeklyIssuesClosed');
            incrementStat(actor, 'dailyIssuesClosed');
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
