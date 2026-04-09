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
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const rankBg = rank === 1 ? 'rank-1-bg' : rank === 2 ? 'rank-2-bg' : rank === 3 ? 'rank-3-bg' : '';
  const avatarRing = rank === 1 ? 'avatar-ring-gold' : rank === 2 ? 'avatar-ring-silver' : rank === 3 ? 'avatar-ring-bronze' : '';
  const rankColor = rank === 1 ? 'text-gold' : rank === 2 ? 'text-silver' : rank === 3 ? 'text-bronze' : 'text-t3';
  const rankIcon = RANK_ICONS[rank - 1];

  return (
    <motion.div
      layout
      className={`h-[72px] flex items-center px-4 gap-3 relative ${rankBg} ${isGhost ? 'opacity-50' : ''}`}
      animate={xpFlash ? { backgroundColor: ['rgba(34,197,94,0.08)', 'transparent'] } : {}}
      transition={{ duration: 0.8 }}
    >
      {/* Rank */}
      <div className="w-[32px] flex flex-col items-center shrink-0">
        {rankIcon ? (
          <span className="text-[16px]">{rankIcon}</span>
        ) : (
          <span className={`font-mono text-[14px] font-medium ${rankColor}`}>
            #{rank}
          </span>
        )}
      </div>

      {/* Avatar */}
      <motion.div
        className={`w-[36px] h-[36px] rounded-full shrink-0 overflow-hidden ${avatarRing}`}
        animate={{ scale: [1, 1.018, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <div
            className="w-full h-full rounded-full flex items-center justify-center font-mono text-[12px] font-medium text-bg"
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
        )}
      </motion.div>

      {/* Name + Level + XP bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[14px] font-medium truncate ${rank === 1 ? 'text-gold' : 'text-t1'}`}>{name}</span>
          <span className="font-mono text-[9px] text-bg bg-t3 rounded px-1.5 py-[1px] uppercase tracking-wider shrink-0">
            {level.title}
          </span>
        </div>
        {/* XP progress bar */}
        <div className="w-full h-[3px] bg-muted mt-1.5 rounded-full overflow-hidden">
          <div
            className="h-full gradient-bar-xp rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Streak */}
      {s.streak > 0 && (
        <span className="font-mono text-[11px] text-amber shrink-0 animate-fire-pulse">
          🔥 {s.streak}d
        </span>
      )}

      {/* XP */}
      <div className="flex items-baseline gap-1 shrink-0 relative min-w-[70px] justify-end">
        <span className={`font-mono text-[15px] font-medium ${rank <= 3 ? 'text-t1' : 'text-t1'}`}>
          {s.weeklyXp.toLocaleString()}
        </span>
        <span className="font-mono text-[9px] text-green">xp</span>

        {/* Float-up animation */}
        <AnimatePresence>
          {xpFlash && (
            <motion.span
              className="absolute -top-3 right-0 font-mono text-[12px] text-green pointer-events-none font-medium"
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
