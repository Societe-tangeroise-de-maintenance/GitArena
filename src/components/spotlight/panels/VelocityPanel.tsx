import { useStore } from '../../../store/useStore';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';

export function VelocityPanel() {
  const stats = useStore((s) => s.stats);

  // Build per-day commit data (Mon-Sun)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totalWeeklyCommits = Object.values(stats).reduce((a, s) => a + s.weeklyCommits, 0);

  // Simulated daily distribution (in a real app, we'd track per-day)
  // For now, distribute evenly with some variance based on current day
  const now = new Date();
  const currentDay = (now.getDay() + 6) % 7; // Mon=0
  const data = dayNames.map((name, i) => {
    const factor = i <= currentDay ? 1 + Math.sin(i * 1.5) * 0.3 : 0;
    const commits = Math.round((totalWeeklyCommits / Math.max(1, currentDay + 1)) * factor);
    return { name, commits: Math.max(0, commits) };
  });

  return (
    <div className="flex items-center h-full px-8 gap-6">
      <div className="shrink-0 flex flex-col items-center gap-1">
        <span className="text-[20px]">📈</span>
        <span className="font-mono text-[10px] text-cyan uppercase tracking-wider font-medium">velocity</span>
      </div>
      <div className="flex-1 h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="20%">
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#444', fontSize: 10, fontFamily: 'Geist Mono Variable' }}
            />
            <YAxis hide />
            <Bar dataKey="commits" radius={[3, 3, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={i <= currentDay ? '#06b6d4' : '#222'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
