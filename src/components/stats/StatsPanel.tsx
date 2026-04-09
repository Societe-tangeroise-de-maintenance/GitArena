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
  const bossProgress = useStore((s) => s.bossProgress);
  const bossIndex = useStore((s) => s.bossIndex);

  const totalCommits = Object.values(stats).reduce((a, s) => a + s.weeklyCommits, 0);
  const totalPRsMerged = Object.values(stats).reduce((a, s) => a + s.weeklyPRsMerged, 0);
  const totalIssuesClosed = Object.values(stats).reduce((a, s) => a + s.weeklyIssuesClosed, 0);
  const totalReviews = Object.values(stats).reduce((a, s) => a + s.weeklyPRsReviewed, 0);
  const totalLinesAdded = Object.values(stats).reduce((a, s) => a + s.weeklyLinesAdded, 0);
  const totalLinesDeleted = Object.values(stats).reduce((a, s) => a + s.weeklyLinesDeleted, 0);

  const goal = CONFIG.bossGoals[bossIndex];

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-[14px]">📊</span>
        <span className="font-mono text-[11px] text-t3 uppercase tracking-wider">
          team stats
        </span>
      </div>

      <div className="px-4 flex-1 space-y-2">
        <StatRow icon="📦" label="commits" value={totalCommits} />
        <StatRow icon="✅" label="merged" value={totalPRsMerged} />
        <StatRow icon="🎯" label="closed" value={totalIssuesClosed} />
        <StatRow icon="👁️" label="reviews" value={totalReviews} />
        <StatRow icon="➕" label="lines +" value={totalLinesAdded} color="text-green" />
        <StatRow icon="➖" label="lines −" value={totalLinesDeleted} color="text-red" />

        {/* Boss progress bars */}
        {goal && (
          <div className="mt-3 space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]">👾</span>
              <span className="font-mono text-[10px] text-red uppercase tracking-wider font-medium">
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
                      <span className="text-[10px]">{BOSS_ICONS[g.metric] || '⚡'}</span>
                      <span className="font-mono text-[10px] text-t3">{g.label}</span>
                    </div>
                    <span className={`font-mono text-[10px] ${complete ? 'text-green' : 'text-t2'}`}>
                      {val}/{g.target} {complete ? '✓' : ''}
                    </span>
                  </div>
                  <div className="h-[4px] bg-muted rounded-full overflow-hidden">
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
      <span className="text-[11px] w-[18px] text-center">{icon}</span>
      <span className="font-mono text-[11px] text-t3 flex-1">{label}</span>
      <span className={`font-mono text-[15px] font-medium ${color || 'text-t1'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
