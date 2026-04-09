import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { CONFIG } from '../config';
import { searchIssues, weekStart } from '../lib/github';

export function useFullSync() {
  const isDemo = useStore((s) => s.isDemo);
  const setBossProgress = useStore((s) => s.setBossProgress);
  const setShamePRs = useStore((s) => s.setShamePRs);
  const setBelts = useStore((s) => s.setBelts);
  const stats = useStore((s) => s.stats);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isDemo) return;

    async function sync() {
      const ws = weekStart();
      try {
        // PRs merged count
        const merged = await searchIssues(`org:${CONFIG.org}+type:pr+is:merged+closed:>=${ws}`);
        setBossProgress('prsMerged', merged.length);

        // Issues closed count
        const closed = await searchIssues(`org:${CONFIG.org}+type:issue+is:closed+closed:>=${ws}`);
        setBossProgress('issuesClosed', closed.length);

        // Total commits from stats
        const totalCommits = Object.values(stats).reduce((a, s) => a + s.weeklyCommits, 0);
        setBossProgress('commits', totalCommits);

        // Shame PRs (open + no review)
        const shamePRsRaw = await searchIssues(`org:${CONFIG.org}+type:pr+is:open+review:none`);
        const shame = shamePRsRaw.map((pr: Record<string, unknown>) => ({
          title: (pr.title as string) || '',
          repo: ((pr.repository_url as string) || '').split('/').pop() || '',
          author: ((pr.user as Record<string, string>)?.login) || '',
          age: Math.round((Date.now() - new Date(pr.created_at as string).getTime()) / 3_600_000),
        }));
        setShamePRs(shame);

        // Belts
        const allStats = Object.values(stats);
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
      } catch {
        // Sync failed — retry next interval
      }
    }

    sync();
    timerRef.current = setInterval(sync, CONFIG.fullSyncInterval * 1000);
    return () => clearInterval(timerRef.current);
  }, [isDemo, setBossProgress, setShamePRs, setBelts, stats]);
}
