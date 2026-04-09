import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { CONFIG } from '../config';
import { searchIssues, searchCommits, monthStart, isBot } from '../lib/github';
import { XP_VALUES } from '../lib/xp';
import type { FeedItem } from '../types';

export function useFullSync() {
  const isDemo = useStore((s) => s.isDemo);
  const setBossProgress = useStore((s) => s.setBossProgress);
  const setShamePRs = useStore((s) => s.setShamePRs);
  const setBelts = useStore((s) => s.setBelts);
  const applySyncData = useStore((s) => s.applySyncData);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isDemo) return;

    async function sync() {
      const ws = monthStart();
      try {
        // ── Per-user data from Search API ──
        // Search API has its own rate limit (30/min), works even when core is exhausted

        // 1. Commits (search/commits endpoint)
        const commitItems = await searchCommits(`org:${CONFIG.org} committer-date:>=${ws}`);
        const commitsByUser: Record<string, { count: number; avatarUrl: string; repos: Set<string>; lastMsg: string; lastTime: string }> = {};
        for (const c of commitItems) {
          const login = (c as Record<string, unknown>).author
            ? ((c as Record<string, unknown>).author as Record<string, string>)?.login
            : ((c as Record<string, unknown>).committer as Record<string, string>)?.login;
          if (!login || isBot(login)) continue;
          const avatar = ((c as Record<string, unknown>).author as Record<string, string>)?.avatar_url || '';
          const repo = ((c as Record<string, unknown>).repository as Record<string, string>)?.name || '';
          const msg = ((c as Record<string, unknown>).commit as Record<string, unknown>)?.message as string || '';
          const time = (((c as Record<string, unknown>).commit as Record<string, unknown>)?.author as Record<string, string>)?.date || '';
          if (!commitsByUser[login]) commitsByUser[login] = { count: 0, avatarUrl: avatar, repos: new Set(), lastMsg: '', lastTime: '' };
          commitsByUser[login].count++;
          commitsByUser[login].repos.add(repo);
          if (time > commitsByUser[login].lastTime) {
            commitsByUser[login].lastMsg = msg.split('\n')[0];
            commitsByUser[login].lastTime = time;
          }
        }

        // 2. PRs created this month (includes merged status)
        const prItems = await searchIssues(`org:${CONFIG.org} type:pr created:>=${ws}`);
        const prDataByUser: Record<string, { opens: number; merges: number; avatarUrl: string; items: Array<{ title: string; repo: string; time: string; merged: boolean }> }> = {};
        for (const pr of prItems) {
          const p = pr as Record<string, unknown>;
          const login = (p.user as Record<string, string>)?.login;
          if (!login || isBot(login)) continue;
          const avatar = (p.user as Record<string, string>)?.avatar_url || '';
          const repo = ((p.repository_url as string) || '').split('/').pop() || '';
          const merged = !!(p.pull_request as Record<string, unknown>)?.merged_at;
          const title = (p.title as string) || '';
          const time = merged
            ? ((p.pull_request as Record<string, string>)?.merged_at || (p.created_at as string))
            : (p.created_at as string);
          if (!prDataByUser[login]) prDataByUser[login] = { opens: 0, merges: 0, avatarUrl: avatar, items: [] };
          prDataByUser[login].opens++;
          if (merged) prDataByUser[login].merges++;
          prDataByUser[login].items.push({ title, repo, time, merged });
        }

        // 3. Issues closed this month
        const closedIssues = await searchIssues(`org:${CONFIG.org} type:issue is:closed closed:>=${ws}`);
        const issuesClosedByUser: Record<string, { count: number; avatarUrl: string; items: Array<{ title: string; repo: string; time: string }> }> = {};
        for (const issue of closedIssues) {
          const iss = issue as Record<string, unknown>;
          const login = (iss.user as Record<string, string>)?.login;
          if (!login || isBot(login)) continue;
          const avatar = (iss.user as Record<string, string>)?.avatar_url || '';
          const repo = ((iss.repository_url as string) || '').split('/').pop() || '';
          const title = (iss.title as string) || '';
          const time = (iss.closed_at as string) || '';
          if (!issuesClosedByUser[login]) issuesClosedByUser[login] = { count: 0, avatarUrl: avatar, items: [] };
          issuesClosedByUser[login].count++;
          issuesClosedByUser[login].items.push({ title, repo, time });
        }

        // ── Compute per-user XP and apply ──
        const allLogins = new Set([
          ...Object.keys(commitsByUser),
          ...Object.keys(prDataByUser),
          ...Object.keys(issuesClosedByUser),
        ]);

        const syncData: Array<{ login: string; avatarUrl: string; xp: number; commits: number; prOpens: number; prMerges: number; issueCloses: number }> = [];
        const feedItems: FeedItem[] = [];

        for (const login of allLogins) {
          const c = commitsByUser[login];
          const p = prDataByUser[login];
          const ic = issuesClosedByUser[login];
          const commits = c?.count || 0;
          const prOpens = p?.opens || 0;
          const prMerges = p?.merges || 0;
          const issueCloses = ic?.count || 0;

          const xp =
            commits * XP_VALUES.commit +
            prOpens * XP_VALUES.prOpened +
            prMerges * XP_VALUES.prMerged +
            issueCloses * XP_VALUES.issueClosed;

          const avatarUrl = c?.avatarUrl || p?.avatarUrl || ic?.avatarUrl || '';
          syncData.push({ login, avatarUrl, xp, commits, prOpens, prMerges, issueCloses });

          // Create feed items from search results
          if (c && c.lastMsg) {
            feedItems.push({
              id: `sync-commit-${login}`,
              type: 'commit',
              user: login,
              repo: [...c.repos][0] || '',
              message: `pushed ${commits} commit${commits > 1 ? 's' : ''}`,
              detail: c.lastMsg,
              xp: commits * XP_VALUES.commit,
              time: c.lastTime,
            });
          }
          if (p) {
            for (const item of p.items) {
              const feedType = item.merged ? 'pr-merged' : 'pr-opened';
              feedItems.push({
                id: `sync-pr-${item.repo}-${item.title.slice(0, 20)}`,
                type: feedType,
                user: login,
                repo: item.repo,
                message: item.merged ? 'merged PR' : 'opened PR',
                detail: item.title,
                xp: item.merged ? XP_VALUES.prMerged : XP_VALUES.prOpened,
                time: item.time,
              });
            }
          }
          if (ic) {
            for (const item of ic.items) {
              feedItems.push({
                id: `sync-issue-${item.repo}-${item.title.slice(0, 20)}`,
                type: 'issue',
                user: login,
                repo: item.repo,
                message: 'closed issue',
                detail: item.title,
                xp: XP_VALUES.issueClosed,
                time: item.time,
              });
            }
          }
        }

        applySyncData(syncData, feedItems);

        // ── Boss progress (authoritative from search) ──
        const totalMerged = Object.values(prDataByUser).reduce((a, p) => a + p.merges, 0);
        setBossProgress('prsMerged', totalMerged);
        setBossProgress('issuesClosed', closedIssues.length);
        // For commits: use search count or stats, whichever is higher
        const searchCommitTotal = Object.values(commitsByUser).reduce((a, c) => a + c.count, 0);
        const statsCommitTotal = Object.values(useStore.getState().stats).reduce((a, s) => a + s.weeklyCommits, 0);
        setBossProgress('commits', Math.max(searchCommitTotal, statsCommitTotal));

        // ── Shame PRs ──
        const shamePRsRaw = await searchIssues(`org:${CONFIG.org} type:pr is:open review:none`);
        const shame = shamePRsRaw.map((pr: Record<string, unknown>) => ({
          title: (pr.title as string) || '',
          repo: ((pr.repository_url as string) || '').split('/').pop() || '',
          author: ((pr.user as Record<string, string>)?.login) || '',
          age: Math.round((Date.now() - new Date(pr.created_at as string).getTime()) / 3_600_000),
        }));
        setShamePRs(shame);

        // ── Belts ──
        const allStats = Object.values(useStore.getState().stats);
        if (allStats.length > 0) {
          const reviewer = allStats.reduce((best, s) =>
            s.weeklyPRsReviewed > (best?.weeklyPRsReviewed || 0) ? s : best, allStats[0]);
          const closer = allStats.reduce((best, s) =>
            s.weeklyIssuesClosed > (best?.weeklyIssuesClosed || 0) ? s : best, allStats[0]);
          const speed = allStats.reduce((best, s) =>
            s.weeklyPRsMerged > (best?.weeklyPRsMerged || 0) ? s : best, allStats[0]);

          setBelts({
            reviewer: reviewer?.login || null,
            closer: closer?.login || null,
            speedKing: speed?.login || null,
          });
        }
      } catch (err) {
        console.warn('[GitArena:sync] Full sync failed:', err);
      }
    }

    sync();
    timerRef.current = setInterval(sync, CONFIG.fullSyncInterval * 1000);
    return () => clearInterval(timerRef.current);
  }, [isDemo, setBossProgress, setShamePRs, setBelts, applySyncData]);
}
