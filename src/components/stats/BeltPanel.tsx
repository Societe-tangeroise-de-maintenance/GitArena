import { useStore } from '../../store/useStore';

export function BeltPanel() {
  const belts = useStore((s) => s.belts);
  const members = useStore((s) => s.members);

  const getMember = (login: string | null) => {
    if (!login) return null;
    return members.find((m) => m.login === login) || null;
  };

  return (
    <div className="px-4 py-3 border-t border-border">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[14px]">🥋</span>
        <span className="font-mono text-[13px] text-t3 uppercase tracking-wider">
          belt holders
        </span>
      </div>
      <div className="space-y-2">
        <BeltRow emoji="👁️" label="reviewer" member={getMember(belts.reviewer)} />
        <BeltRow emoji="🎯" label="closer" member={getMember(belts.closer)} />
        <BeltRow emoji="⚡" label="speed king" member={getMember(belts.speedKing)} />
      </div>
    </div>
  );
}

function BeltRow({ emoji, label, member }: { emoji: string; label: string; member: { login: string; name: string; avatarUrl: string; color: string } | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[14px]">{emoji}</span>
      <span className="font-mono text-[13px] text-t3 w-[75px]">{label}</span>
      {member ? (
        <div className="flex items-center gap-1.5">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name} className="w-[20px] h-[20px] rounded-full" />
          ) : (
            <div className="w-[20px] h-[20px] rounded-full" style={{ backgroundColor: member.color }} />
          )}
          <span className="font-mono text-[13px] text-t1 truncate">{member.name}</span>
        </div>
      ) : (
        <span className="font-mono text-[13px] text-t3">—</span>
      )}
    </div>
  );
}
