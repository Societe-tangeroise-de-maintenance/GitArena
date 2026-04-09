import { useStore } from '../../store/useStore';
import { CONFIG } from '../../config';
import { BeltPanel } from './BeltPanel';

const BOSS_ICONS: Record<string, string> = {
  issuesClosed: '🎯',
  prsMerged: '✅',
  commits: '📦',
};

export function StatsPanel() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);
  const bossProgress = useStore((s) => s.bossProgress);
  const bossIndex = useStore((s) => s.bossIndex);

  const totalCommits = Object.values(stats).reduce((a, s) => a + s.weeklyCommits, 0);
  const totalPRsMerged = Object.values(stats).reduce((a, s) => a + s.weeklyPRsMerged, 0);
  const totalIssuesClosed = Object.values(stats).reduce((a, s) => a + s.weeklyIssuesClosed, 0);
  const totalReviews = Object.values(stats).reduce((a, s) => a + s.weeklyPRsReviewed, 0);
  const totalLinesAdded = Object.values(stats).reduce((a, s) => a + s.weeklyLinesAdded, 0);
  const totalLinesDeleted = Object.values(stats).reduce((a, s) => a + s.weeklyLinesDeleted, 0);

  const goal = CONFIG.bossGoals[bossIndex];

  // Today's commits
  const todayCommits = Object.values(stats).reduce((a, s) => a + s.dailyCommits, 0);

  // Streak leaders (top 3 by streak)
  const streakLeaders = Object.values(stats)
    .filter((s) => s.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  // Most active repo (from feed)
  const feed = useStore((s) => s.feed);
  const repoCounts: Record<string, number> = {};
  for (const item of feed) {
    if (item.repo) repoCounts[item.repo] = (repoCounts[item.repo] || 0) + 1;
  }
  const topRepo = Object.entries(repoCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-[16px]">📊</span>
        <span className="font-mono text-[13px] text-t3 uppercase tracking-wider">
          team stats
        </span>
      </div>

      <div className="px-4 flex-1 space-y-2 overflow-y-auto">
        <StatRow icon="📦" label="commits" value={totalCommits} />
        <StatRow icon="✅" label="merged" value={totalPRsMerged} />
        <StatRow icon="🎯" label="closed" value={totalIssuesClosed} />
        <StatRow icon="👁️" label="reviews" value={totalReviews} />
        <StatRow icon="➕" label="lines +" value={totalLinesAdded} color="text-green" />
        <StatRow icon="➖" label="lines −" value={totalLinesDeleted} color="text-red" />

        {/* Today's Commits widget */}
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">📅</span>
            <span className="font-mono text-[13px] text-t3">today</span>
            <span className="font-mono text-[18px] font-medium text-t1 ml-auto">{todayCommits}</span>
            <span className="font-mono text-[13px] text-t3">commits</span>
          </div>
        </div>

        {/* Streak Leaders widget */}
        {streakLeaders.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[14px]">🔥</span>
              <span className="font-mono text-[13px] text-t3">streak leaders</span>
            </div>
            {streakLeaders.map((s) => {
              const member = members.find((m) => m.login === s.login);
              return (
                <div key={s.login} className="flex items-center gap-2 py-0.5">
                  {member?.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.name} className="w-[18px] h-[18px] rounded-full" />
                  ) : (
                    <div className="w-[18px] h-[18px] rounded-full" style={{ backgroundColor: member?.color || '#444' }} />
                  )}
                  <span className="font-mono text-[13px] text-t1 truncate flex-1">{member?.name || s.login}</span>
                  <span className="font-mono text-[14px] text-amber font-medium">{s.streak}d</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Most Active Repo widget */}
        {topRepo && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px]">📁</span>
              <span className="font-mono text-[13px] text-t3">hottest repo</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[14px] text-t1 font-medium truncate">{topRepo[0]}</span>
              <span className="font-mono text-[13px] text-cyan ml-auto">{topRepo[1]} events</span>
            </div>
          </div>
        )}

        {/* Boss progress bars */}
        {goal && (
          <div className="mt-3 space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px]">👾</span>
              <span className="font-mono text-[13px] text-red uppercase tracking-wider font-medium">
                boss goals
              </span>
            </div>
            {CONFIG.bossGoals.map((g) => {
              const val = bossProgress[g.metric] || 0;
              const pct = Math.min(100, (val / g.target) * 100);
              const complete = val >= g.target;
              return (
                <div key={g.metric}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[13px]">{BOSS_ICONS[g.metric] || '⚡'}</span>
                      <span className="font-mono text-[13px] text-t3">{g.label}</span>
                    </div>
                    <span className={`font-mono text-[13px] ${complete ? 'text-green' : 'text-t2'}`}>
                      {val}/{g.target} {complete ? '✓' : ''}
                    </span>
                  </div>
                  <div className="h-[6px] bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-green' : 'gradient-bar-boss'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BeltPanel />
    </div>
  );
}

function StatRow({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[14px] w-[20px] text-center">{icon}</span>
      <span className="font-mono text-[13px] text-t3 flex-1">{label}</span>
      <span className={`font-mono text-[17px] font-medium ${color || 'text-t1'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
