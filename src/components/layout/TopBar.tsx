import { useStore } from '../../store/useStore';
import { CONFIG } from '../../config';

export function TopBar() {
  const stats = useStore((s) => s.stats);
  const bossProgress = useStore((s) => s.bossProgress);
  const bossIndex = useStore((s) => s.bossIndex);
  const isDemo = useStore((s) => s.isDemo);

  const totalXp = Object.values(stats).reduce((a, s) => a + s.weeklyXp, 0);
  const totalCommits = Object.values(stats).reduce((a, s) => a + s.weeklyCommits, 0);
  const memberCount = Object.keys(stats).length;

  const goal = CONFIG.bossGoals[bossIndex];
  const bossPercent = goal
    ? Math.min(100, Math.round(((bossProgress[goal.metric] || 0) / goal.target) * 100))
    : 100;

  // Last commit time
  const lastCommitTimes = Object.values(stats)
    .map((s) => s.lastCommitDate)
    .filter(Boolean) as string[];
  const lastCommit = lastCommitTimes.length
    ? new Date(Math.max(...lastCommitTimes.map((t) => new Date(t).getTime())))
    : null;
  const minutesAgo = lastCommit
    ? Math.round((Date.now() - lastCommit.getTime()) / 60_000)
    : null;
  const clockColor =
    minutesAgo === null
      ? 'text-t3'
      : minutesAgo < 30
        ? 'text-green'
        : minutesAgo < 120
          ? 'text-amber'
          : 'text-red';

  return (
    <div className="h-[56px] w-full bg-panel/80 backdrop-blur-sm flex items-center justify-between px-6 relative">
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue/30 to-transparent" />

      {/* Left: Logo + org */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[22px]">⚔️</span>
          <span className="font-mono text-[20px] font-medium tracking-tight neon-text-cyan">
            GitArena
          </span>
        </div>
        <div className="h-4 w-[1px] bg-border" />
        <span className="font-mono text-[13px] text-t3">
          {CONFIG.org}
        </span>
        {isDemo && (
          <span className="font-mono text-[13px] text-amber bg-amber/10 px-2 py-0.5 rounded">
            DEMO
          </span>
        )}
      </div>

      {/* Center: Boss fight bar */}
      <div className="flex items-center gap-4">
        {goal && (
          <div className="flex items-center gap-3 bg-raised/50 rounded-lg px-4 py-1.5">
            <span className="text-[16px]">👾</span>
            <span className="font-mono text-[13px] text-red uppercase tracking-wider font-medium neon-text-red">
              boss
            </span>
            <div className="w-[200px] h-[10px] bg-muted rounded-full overflow-hidden relative">
              <div
                className={`h-full gradient-bar-boss rounded-full transition-all duration-700 ${bossPercent > 80 ? 'animate-pulse-glow' : ''}`}
                style={{ width: `${bossPercent}%` }}
              />
            </div>
            <span className="font-mono text-[14px] text-t1 font-medium">
              {bossPercent}%
            </span>
            <span className="font-mono text-[13px] text-t3">
              {goal.label}
            </span>
          </div>
        )}
      </div>

      {/* Right: Stats */}
      <div className="flex items-center gap-5">
        <StatPill icon="👥" label="team" value={memberCount} />
        <StatPill icon="⚡" label="xp" value={totalXp} glow />
        <StatPill icon="📦" label="commits" value={totalCommits} />
        <div className={`flex items-center gap-1.5 ${clockColor}`}>
          <span className="text-[14px]">⏱</span>
          <span className="font-mono text-[13px] font-medium">
            {minutesAgo !== null ? `${minutesAgo}m ago` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, glow }: { icon: string; label: string; value: number; glow?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${glow ? 'glow-green rounded-md px-2 py-0.5' : ''}`}>
      <span className="text-[14px]">{icon}</span>
      <span className="font-mono text-[13px] text-t3">{label}</span>
      <span className={`font-mono text-[16px] font-medium ${glow ? 'neon-text-green' : 'text-t1'}`}>{value.toLocaleString()}</span>
    </div>
  );
}
