import { useStore } from '../../../store/useStore';

const FUN_STATS = [
  {
    label: 'lines deleted this week',
    icon: '🗑️',
    getValue: (stats: Record<string, { weeklyLinesDeleted: number }>) =>
      Object.values(stats).reduce((a, s) => a + s.weeklyLinesDeleted, 0),
  },
  {
    label: 'avg XP per member',
    icon: '⭐',
    getValue: (stats: Record<string, { weeklyXp: number }>) => {
      const vals = Object.values(stats);
      if (vals.length === 0) return 0;
      return Math.round(vals.reduce((a, s) => a + s.weeklyXp, 0) / vals.length);
    },
  },
  {
    label: 'total commits today',
    icon: '📦',
    getValue: (stats: Record<string, { dailyCommits: number }>) =>
      Object.values(stats).reduce((a, s) => a + s.dailyCommits, 0),
  },
  {
    label: 'longest streak (days)',
    icon: '🔥',
    getValue: (stats: Record<string, { longestStreak: number }>) =>
      Math.max(0, ...Object.values(stats).map((s) => s.longestStreak)),
  },
];

export function FunStatPanel() {
  const stats = useStore((s) => s.stats);

  // Rotate through fun stats based on time
  const idx = Math.floor(Date.now() / 30_000) % FUN_STATS.length;
  const stat = FUN_STATS[idx];
  const value = stat.getValue(stats as never);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <span className="text-[36px]">{stat.icon}</span>
      <span className="font-mono text-[56px] text-t1 font-medium glow-blue rounded-lg px-4">{value.toLocaleString()}</span>
      <span className="font-mono text-[18px] text-t3">{stat.label}</span>
    </div>
  );
}
