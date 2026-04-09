import type { FeedItem as FeedItemType } from '../../types';
import { useStore } from '../../store/useStore';

const TYPE_CONFIG: Record<FeedItemType['type'], { color: string; icon: string }> = {
  'commit':    { color: 'bg-blue',   icon: '📦' },
  'pr-opened': { color: 'bg-purple', icon: '🔀' },
  'pr-merged': { color: 'bg-green',  icon: '✅' },
  'review':    { color: 'bg-teal',   icon: '👁️' },
  'issue':     { color: 'bg-amber',  icon: '🎯' },
  'badge':     { color: 'bg-t1',     icon: '🏅' },
  'streak':    { color: 'bg-red',    icon: '🔥' },
  'level-up':  { color: 'bg-t1',     icon: '⬆️' },
};

function timeAgo(time: string): string {
  const diff = Date.now() - new Date(time).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface Props {
  item: FeedItemType;
  odd?: boolean;
}

export function FeedItem({ item, odd }: Props) {
  const members = useStore((s) => s.members);
  const member = members.find((m) => m.login === item.user);
  const color = member?.color || '#444';
  const avatarUrl = member?.avatarUrl;
  const config = TYPE_CONFIG[item.type];
  const initials = (member?.name || item.user)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`flex gap-3 px-4 py-2.5 min-h-[52px] ${odd ? 'bg-raised/30' : ''}`}>
      {/* Type icon + bar */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-[14px]">{config.icon}</span>
        <div className={`w-[2px] flex-1 rounded-full ${config.color} opacity-40`} />
      </div>

      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {avatarUrl ? (
          <img src={avatarUrl} alt={member?.name || item.user} className="w-[26px] h-[26px] rounded-full object-cover" />
        ) : (
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center font-mono text-[9px] font-medium text-bg"
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium text-t1 truncate">
            {member?.name || item.user}
          </span>
          <span className="text-[12px] text-t2 truncate">{item.message}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.detail && (
            <span className="font-mono text-[11px] text-t3 truncate">
              {item.detail}
            </span>
          )}
          <span className="font-mono text-[10px] text-t3 bg-muted rounded px-1.5 py-[1px]">{item.repo}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        {item.xp > 0 && (
          <span className="font-mono text-[11px] text-green font-medium glow-green rounded px-1">+{item.xp}</span>
        )}
        <span className="font-mono text-[10px] text-t3">{timeAgo(item.time)}</span>
      </div>
    </div>
  );
}
