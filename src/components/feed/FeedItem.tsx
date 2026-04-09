import type { FeedItem as FeedItemType } from '../../types';
import { useStore } from '../../store/useStore';
import { useEffect, useRef } from 'react';
import { sfxXp, sfxCommit, sfxPROpened, sfxPRMerged, sfxIssueClosed, sfxReview, sfxStreak } from '../../lib/sounds';

const TYPE_CONFIG: Record<FeedItemType['type'], { color: string; barColor: string; icon: string }> = {
  'commit':       { color: 'bg-blue',   barColor: 'bg-blue',   icon: '📦' },
  'pr-opened':    { color: 'bg-purple', barColor: 'bg-purple', icon: '🔀' },
  'pr-merged':    { color: 'bg-green',  barColor: 'bg-green',  icon: '✅' },
  'review':       { color: 'bg-teal',   barColor: 'bg-teal',   icon: '👁️' },
  'issue':        { color: 'bg-amber',  barColor: 'bg-amber',  icon: '🎯' },
  'issue-opened': { color: 'bg-cyan',   barColor: 'bg-cyan',   icon: '📝' },
  'badge':        { color: 'bg-gold',   barColor: 'bg-gold',   icon: '🏅' },
  'streak':       { color: 'bg-red',    barColor: 'bg-red',    icon: '🔥' },
  'level-up':     { color: 'bg-gold',   barColor: 'bg-gold',   icon: '⬆️' },
};

const EPIC_TYPES = new Set<FeedItemType['type']>(['pr-merged', 'badge', 'level-up']);

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
  isNew?: boolean;
}

export function FeedItem({ item, isNew }: Props) {
  const members = useStore((s) => s.members);
  const didPlay = useRef(false);
  useEffect(() => {
    if (isNew && !didPlay.current) {
      didPlay.current = true;
      const sfxMap: Record<string, () => void> = {
        'commit': sfxCommit,
        'pr-opened': sfxPROpened,
        'pr-merged': sfxPRMerged,
        'issue': sfxIssueClosed,
        'issue-opened': sfxXp,
        'review': sfxReview,
        'streak': sfxStreak,
        'badge': sfxXp,
        'level-up': sfxXp,
      };
      (sfxMap[item.type] || sfxXp)();
    }
  }, [isNew, item.type]);
  const member = members.find((m) => m.login === item.user);
  const color = member?.color || '#444';
  const avatarUrl = member?.avatarUrl;
  const config = TYPE_CONFIG[item.type];
  const isEpic = EPIC_TYPES.has(item.type);
  const initials = (member?.name || item.user)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`flex gap-3 px-4 py-2.5 min-h-[56px] ${isEpic ? 'feed-epic' : ''} ${isNew ? 'feed-flash-in' : ''}`}>
      {/* Type icon + neon bar */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-[16px]">{config.icon}</span>
        <div className={`feed-bar flex-1 ${config.barColor} opacity-60`} />
      </div>

      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {avatarUrl ? (
          <img src={avatarUrl} alt={member?.name || item.user} className="w-[30px] h-[30px] rounded-full object-cover" />
        ) : (
          <div
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-mono text-[13px] font-medium text-bg"
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[14px] font-medium truncate ${isEpic ? 'text-gold' : 'text-t1'}`}>
            {member?.name || item.user}
          </span>
          <span className="text-[13px] text-t2 truncate">{item.message}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.detail && (
            <span className="font-mono text-[13px] text-t3 truncate">
              {item.detail}
            </span>
          )}
          <span className="font-mono text-[13px] text-t3 bg-muted rounded px-1.5 py-[1px]">{item.repo}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        {item.xp > 0 && (
          <span className={`font-mono text-[13px] text-green font-medium glow-green rounded px-1 ${isNew ? 'xp-badge-glow' : ''}`}>+{item.xp}</span>
        )}
        <span className="font-mono text-[13px] text-t3">{timeAgo(item.time)}</span>
      </div>
    </div>
  );
}
