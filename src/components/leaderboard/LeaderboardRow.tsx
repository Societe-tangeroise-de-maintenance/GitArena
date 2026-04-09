import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { getLevel, getLevelProgress } from '../../lib/xp';
import { useState, useEffect } from 'react';

interface Props {
  login: string;
  rank: number;
  color: string;
  name: string;
  avatarUrl: string;
}

const RANK_ICONS = ['👑', '🥈', '🥉'];

export function LeaderboardRow({ login, rank, color, name, avatarUrl }: Props) {
  const s = useStore((state) => state.stats[login]);
  const previousRanks = useStore((state) => state.previousRanks);
  const [xpFlash, setXpFlash] = useState<number | null>(null);
  const [prevXp, setPrevXp] = useState(s?.weeklyXp || 0);

  useEffect(() => {
    if (!s) return;
    if (s.weeklyXp > prevXp && prevXp > 0) {
      setXpFlash(s.weeklyXp - prevXp);
      const t = setTimeout(() => setXpFlash(null), 1500);
      return () => clearTimeout(t);
    }
    setPrevXp(s.weeklyXp);
  }, [s?.weeklyXp, prevXp, s]);

  if (!s) return null;

  const level = getLevel(s.totalXp);
  const progress = getLevelProgress(s.totalXp);
  const isGhost = s.lastActivityTime
    ? Date.now() - new Date(s.lastActivityTime).getTime() > 7 * 24 * 60 * 60 * 1000
    : false;
  const isActive = s.lastActivityTime
    ? Date.now() - new Date(s.lastActivityTime).getTime() < 5 * 60 * 1000
    : false;
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Rank delta
  const prevRank = previousRanks[login];
  const rankDelta = prevRank ? prevRank - rank : 0;

  const isHero = rank === 1;
  const isTop3 = rank <= 3;
  const rowHeight = isHero ? 'h-[94px]' : isTop3 ? 'h-[82px]' : 'h-[68px]';
  const avatarSize = isHero ? 'w-[44px] h-[44px]' : isTop3 ? 'w-[40px] h-[40px]' : 'w-[34px] h-[34px]';
  const avatarText = isHero ? 'text-[14px]' : isTop3 ? 'text-[13px]' : 'text-[11px]';
  const nameSize = isHero ? 'text-[16px]' : 'text-[14px]';

  const rankBg = rank === 1 ? 'rank-1-bg' : rank === 2 ? 'rank-2-bg' : rank === 3 ? 'rank-3-bg' : '';
  const avatarRing = rank === 1 ? 'avatar-ring-gold' : rank === 2 ? 'avatar-ring-silver' : rank === 3 ? 'avatar-ring-bronze' : '';
  const rankColor = rank === 1 ? 'text-gold neon-text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-t3';
  const rankIcon = RANK_ICONS[rank - 1];
  const levelPill = rank === 1 ? 'level-pill-gold' : rank === 2 ? 'level-pill-silver' : rank === 3 ? 'level-pill-bronze' : 'level-pill-default';

  return (
    <motion.div
      className={`${rowHeight} flex items-center px-4 gap-3 relative ${rankBg} ${isGhost ? 'opacity-50' : ''} ${isActive ? 'active-pulse' : ''}`}
      animate={xpFlash ? { backgroundColor: ['rgba(34,197,94,0.08)', 'transparent'] } : {}}
      transition={{ duration: 0.8 }}
    >
      {/* Rank + Delta */}
      <div className="w-[36px] flex flex-col items-center shrink-0">
        {rankIcon ? (
          <span className={`${isHero ? 'text-[20px]' : 'text-[16px]'}`}>{rankIcon}</span>
        ) : (
          <span className={`font-mono text-[14px] font-medium ${rankColor}`}>
            #{rank}
          </span>
        )}
        {rankDelta !== 0 && (
          <span className={`font-mono text-[9px] font-medium ${rankDelta > 0 ? 'text-green neon-text-green' : 'text-red'}`}>
            {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
          </span>
        )}
      </div>

      {/* Avatar */}
      <motion.div
        className={`${avatarSize} rounded-full shrink-0 overflow-hidden ${avatarRing}`}
        animate={{ scale: [1, 1.018, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <div
            className={`w-full h-full rounded-full flex items-center justify-center font-mono ${avatarText} font-medium text-bg`}
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
        )}
      </motion.div>

      {/* Name + Level + XP bar */}
      <div className="flex-1 min-w-0">
        <span className={`${nameSize} font-medium truncate block ${rank === 1 ? 'text-gold neon-text-gold' : 'text-t1'}`}>{name}</span>
        <div className="flex items-center gap-2 mt-1">
          <span className={`font-mono text-[9px] rounded px-1.5 py-[1px] uppercase tracking-wider shrink-0 font-medium ${levelPill}`}>
            {level.title}
          </span>
          {/* XP progress bar */}
          <div className="flex-1 h-[3px] bg-muted rounded-full overflow-hidden">
            <div
              className="h-full gradient-bar-xp rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Streak */}
      {s.streak > 0 && (
        <span className="font-mono text-[11px] text-amber shrink-0 animate-fire-pulse neon-text-gold">
          🔥 {s.streak}d
        </span>
      )}

      {/* XP */}
      <div className="flex items-baseline gap-1 shrink-0 relative min-w-[70px] justify-end">
        <span className={`font-mono ${isHero ? 'text-[17px]' : 'text-[15px]'} font-medium text-t1`}>
          {s.weeklyXp.toLocaleString()}
        </span>
        <span className="font-mono text-[9px] text-green neon-text-green">xp</span>

        {/* Float-up animation */}
        <AnimatePresence>
          {xpFlash && (
            <motion.span
              className="absolute -top-3 right-0 font-mono text-[12px] text-green pointer-events-none font-medium neon-text-green"
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -20 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
            >
              +{xpFlash}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
