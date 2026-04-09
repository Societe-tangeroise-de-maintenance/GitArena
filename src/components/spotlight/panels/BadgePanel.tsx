import { useStore } from '../../../store/useStore';
import { BADGE_DEFS, getBadgeDef } from '../../../lib/badges';

export function BadgePanel() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);

  // Find the most recently awarded badge
  const allBadges: Array<{ login: string; badgeId: string }> = [];
  for (const s of Object.values(stats)) {
    for (const b of s.badges) {
      allBadges.push({ login: s.login, badgeId: b });
    }
  }

  const last = allBadges.length > 0 ? allBadges[allBadges.length - 1] : undefined;
  if (!last) {
    return <div className="flex items-center justify-center h-full font-mono text-[14px] text-t3">no badges earned yet</div>;
  }

  const badge = getBadgeDef(last.badgeId) || BADGE_DEFS[0];
  const member = members.find((m) => m.login === last.login);

  const rarityGlow =
    badge.rarity === 'legendary'
      ? 'glow-gold'
      : badge.rarity === 'rare'
        ? 'glow-purple'
        : 'glow-blue';
  const rarityColor =
    badge.rarity === 'legendary'
      ? 'text-gold'
      : badge.rarity === 'rare'
        ? 'text-purple'
        : 'text-t2';

  return (
    <div className="flex items-center justify-center h-full gap-6">
      <div className={`text-[56px] ${rarityGlow} rounded-full p-2`}>{badge.icon}</div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] text-t3 uppercase tracking-[3px]">🏅 badge earned</span>
        <span className="text-[24px] font-medium text-t1">{badge.name}</span>
        <span className={`font-mono text-[13px] ${rarityColor} uppercase font-medium`}>{badge.rarity}</span>
        <div className="flex items-center gap-2 mt-1">
          {member?.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name} className="w-[24px] h-[24px] rounded-full" />
          ) : null}
          <span className="text-[16px] text-t2">{member?.name || last.login}</span>
        </div>
        <span className="font-mono text-[13px] text-t3">{badge.desc}</span>
      </div>
    </div>
  );
}
