import { useStore } from '../../../store/useStore';
import { getBadgeDef } from '../../../lib/badges';

export function TrophyPanel() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);

  const all: Array<{ login: string; badgeId: string }> = [];
  for (const s of Object.values(stats)) {
    for (const b of s.badges) {
      all.push({ login: s.login, badgeId: b });
    }
  }

  if (all.length === 0) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <span className="text-[24px]">🏆</span>
        <span className="font-mono text-[12px] text-t3">no trophies yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full px-8 gap-4 overflow-x-auto">
      <div className="shrink-0 flex flex-col items-center gap-1">
        <span className="text-[24px]">🏆</span>
        <span className="font-mono text-[10px] text-gold uppercase tracking-wider font-medium">trophies</span>
      </div>
      <div className="flex gap-4 flex-wrap">
        {all.slice(-12).map((entry, i) => {
          const badge = getBadgeDef(entry.badgeId);
          const member = members.find((m) => m.login === entry.login);
          if (!badge) return null;
          const glow = badge.rarity === 'legendary' ? 'glow-gold' : badge.rarity === 'rare' ? 'glow-purple' : '';
          return (
            <div key={i} className={`flex flex-col items-center gap-1 p-1.5 rounded-lg ${glow}`}>
              <span className="text-[24px]">{badge.icon}</span>
              <span className="font-mono text-[9px] text-t2 truncate max-w-[60px]">
                {badge.name}
              </span>
              {member?.avatarUrl ? (
                <img src={member.avatarUrl} alt={member.name} className="w-[16px] h-[16px] rounded-full" />
              ) : (
                <span className="font-mono text-[9px] text-t3 truncate max-w-[60px]">
                  {member?.name || entry.login}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
