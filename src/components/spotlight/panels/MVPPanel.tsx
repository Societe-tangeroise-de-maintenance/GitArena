import { useStore } from '../../../store/useStore';
import { rankedLogins } from '../../../store/useStore';
import { getLevel } from '../../../lib/xp';

export function MVPPanel() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);
  const ranked = rankedLogins(stats);

  const topLogin = ranked[0];
  if (!topLogin) return <div className="text-t3 font-mono text-[12px]">No data yet</div>;

  const s = stats[topLogin];
  const member = members.find((m) => m.login === topLogin);
  const level = getLevel(s.totalXp);

  return (
    <div className="flex items-center gap-8 h-full px-8">
      {/* Big avatar with glow */}
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-full glow-gold animate-pulse-glow" />
        {member?.avatarUrl ? (
          <img src={member.avatarUrl} alt={member.name} className="w-[100px] h-[100px] rounded-full object-cover avatar-ring-gold relative" />
        ) : (
          <div
            className="w-[100px] h-[100px] rounded-full flex items-center justify-center font-mono text-[28px] font-medium text-bg avatar-ring-gold relative"
            style={{ backgroundColor: member?.color || '#444' }}
          >
            {(member?.name || topLogin).slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] uppercase tracking-[3px] font-medium neon-text-gold">
          🏆 mvp this month
        </span>
        <span className="text-[40px] font-medium shimmer-text">
          {member?.name || topLogin}
        </span>
        <span className="font-mono text-[14px] text-t3">
          Level {level.level} · {level.title}
        </span>
      </div>

      <div className="ml-auto grid grid-cols-5 gap-6">
        <StatBlock icon="📦" label="commits" value={s.weeklyCommits} glow />
        <StatBlock icon="✅" label="merged" value={s.weeklyPRsMerged} glow />
        <StatBlock icon="👁️" label="reviews" value={s.weeklyPRsReviewed} glow />
        <StatBlock icon="🎯" label="issues" value={s.weeklyIssuesClosed} glow />
        <StatBlock icon="🔥" label="streak" value={s.streak} suffix="d" glow />
      </div>
    </div>
  );
}

function StatBlock({ icon, label, value, suffix, glow }: { icon: string; label: string; value: number; suffix?: string; glow?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[16px] mb-1">{icon}</span>
      <span className={`font-mono text-[28px] font-medium ${glow ? 'neon-text-cyan' : 'text-t1'}`}>
        {value}{suffix || ''}
      </span>
      <span className="font-mono text-[13px] text-t3">{label}</span>
    </div>
  );
}
