import { useStore } from '../../../store/useStore';
import { rankedLogins } from '../../../store/useStore';

export function DuelPanel() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);
  const ranked = rankedLogins(stats);

  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second) return <div className="text-t3 font-mono text-[12px]">Need 2+ members</div>;

  const s1 = stats[first];
  const s2 = stats[second];
  const m1 = members.find((m) => m.login === first);
  const m2 = members.find((m) => m.login === second);
  const total = s1.weeklyXp + s2.weeklyXp || 1;
  const pct1 = Math.round((s1.weeklyXp / total) * 100);
  const pct2 = 100 - pct1;

  return (
    <div className="flex items-center h-full px-8 gap-6">
      {/* Player 1 */}
      <div className="flex items-center gap-3 w-[220px]">
        <div className="relative">
          {m1?.avatarUrl ? (
            <img src={m1.avatarUrl} alt={m1.name} className="w-[56px] h-[56px] rounded-full object-cover avatar-ring-gold" />
          ) : (
            <div
              className="w-[56px] h-[56px] rounded-full flex items-center justify-center font-mono text-[18px] font-medium text-bg avatar-ring-gold"
              style={{ backgroundColor: m1?.color || '#444' }}
            >
              {(m1?.name || first).slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <div className="text-[24px] font-medium text-t1">{m1?.name || first}</div>
          <div className="font-mono text-[32px] text-gold font-medium">{s1.weeklyXp.toLocaleString()}</div>
        </div>
      </div>

      {/* Bar */}
      <div className="flex-1 flex flex-col items-center gap-2">
        <div className="font-mono text-[13px] text-t3 uppercase tracking-[3px]">⚔️ duel</div>
        <div className="w-full h-[12px] bg-muted rounded-full overflow-hidden flex">
          <div
            className="h-full rounded-l-full transition-all duration-700"
            style={{ width: `${pct1}%`, backgroundColor: m1?.color || '#3b82f6' }}
          />
          <div
            className="h-full rounded-r-full transition-all duration-700"
            style={{ width: `${pct2}%`, backgroundColor: m2?.color || '#a78bfa' }}
          />
        </div>
        <div className="flex justify-between w-full">
          <span className="font-mono text-[14px] text-t1 font-medium">{pct1}%</span>
          <span className="font-mono text-[13px] text-t3 vs-pulse">vs</span>
          <span className="font-mono text-[14px] text-t1 font-medium">{pct2}%</span>
        </div>
      </div>

      {/* Player 2 */}
      <div className="flex items-center gap-3 w-[220px] justify-end text-right">
        <div>
          <div className="text-[24px] font-medium text-t1">{m2?.name || second}</div>
          <div className="font-mono text-[32px] text-silver font-medium">{s2.weeklyXp.toLocaleString()}</div>
        </div>
        <div className="relative">
          {m2?.avatarUrl ? (
            <img src={m2.avatarUrl} alt={m2.name} className="w-[56px] h-[56px] rounded-full object-cover avatar-ring-silver" />
          ) : (
            <div
              className="w-[56px] h-[56px] rounded-full flex items-center justify-center font-mono text-[18px] font-medium text-bg avatar-ring-silver"
              style={{ backgroundColor: m2?.color || '#a78bfa' }}
            >
              {(m2?.name || second).slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
