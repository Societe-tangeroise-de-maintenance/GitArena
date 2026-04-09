import { useStore } from '../../../store/useStore';

export function StreakWallPanel() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);

  const active = Object.values(stats)
    .filter((s) => s.streak > 0)
    .sort((a, b) => b.streak - a.streak);

  if (active.length === 0) {
    return <div className="flex items-center justify-center h-full font-mono text-[12px] text-t3">no active streaks</div>;
  }

  return (
    <div className="flex items-center h-full px-8 gap-6 overflow-x-auto">
      <div className="shrink-0">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[24px] animate-fire-pulse">🔥</span>
          <span className="font-mono text-[10px] text-amber uppercase tracking-wider font-medium">streaks</span>
        </div>
      </div>
      <div className="flex gap-5">
        {active.map((s, i) => {
          const member = members.find((m) => m.login === s.login);
          return (
            <div key={s.login} className="flex flex-col items-center gap-1.5">
              <div className={`relative ${i === 0 ? 'glow-amber' : ''} rounded-full`}>
                {member?.avatarUrl ? (
                  <img src={member.avatarUrl} alt={member.name} className="w-[40px] h-[40px] rounded-full object-cover" />
                ) : (
                  <div
                    className="w-[40px] h-[40px] rounded-full flex items-center justify-center font-mono text-[13px] font-medium text-bg"
                    style={{ backgroundColor: member?.color || '#444' }}
                  >
                    {(member?.name || s.login).slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[11px] text-t2 truncate max-w-[70px]">{member?.name || s.login}</span>
              <span className="font-mono text-[14px] text-amber font-medium animate-fire-pulse">🔥 {s.streak}d</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
