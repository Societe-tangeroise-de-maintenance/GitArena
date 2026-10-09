import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { IconName } from './ui/ArenaIcon';
import type { DevStats, FeedItem, Member } from '../types';

export type UiMode = 'broadcast' | 'arena';

export const eventIcons: Record<FeedItem['type'], IconName> = { commit: 'git', 'branch-push': 'git', 'pr-opened': 'branch', 'pr-merged': 'merge', review: 'review', issue: 'check', 'issue-opened': 'issue', badge: 'medal', streak: 'flame', 'level-up': 'spark' };
export const number = (value: number) => value.toLocaleString();
export const compact = (value: number) => value >= 100000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : number(value);
export const initials = (name: string) => name.split(/\s+/).map(part => part[0] || '').join('').slice(0, 2).toUpperCase();
export const rankBy = (members: Member[], stats: Record<string, DevStats>) => [...members].sort((a, b) => (stats[b.login]?.monthlyXp || 0) - (stats[a.login]?.monthlyXp || 0) || a.login.localeCompare(b.login));

export function elapsed(time: string, now: number) { const minutes = Math.max(0, Math.floor((now - new Date(time).getTime()) / 60000)); if (!Number.isFinite(minutes)) return ''; if (minutes < 1) return 'JUST NOW'; if (minutes < 60) return `${minutes} MIN AGO`; const hours = Math.floor(minutes / 60); return hours < 24 ? `${hours} HR AGO` : `${Math.floor(hours / 24)} D AGO`; }

export function Avatar({ member, large = false, className = '' }: { member?: Member; large?: boolean; className?: string }) {
  const name = member?.name || member?.login || 'Developer';
  return <div className={`arena-avatar ${large ? 'arena-avatar--large' : ''} ${className}`} style={{ '--avatar-color': member?.color || '#87bce9' } as CSSProperties}>{member?.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span>{initials(name)}</span>}</div>;
}

export function AnimatedScore({ xp, className = 'standing-score', unit = 'XP' }: { xp: number; className?: string; unit?: string }) {
  const previous = useRef(xp);
  const [gain, setGain] = useState(0);
  useEffect(() => {
    if (previous.current > 0 && xp > previous.current) {
      setGain(xp - previous.current);
      const id = setTimeout(() => setGain(0), 1700);
      previous.current = xp;
      return () => clearTimeout(id);
    }
    previous.current = xp;
  }, [xp]);
  return <div className={className}><motion.strong key={xp} initial={{ opacity: 0.5, y: 8, scale: 1.07 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35 }}>{number(xp)}</motion.strong><span>{unit}</span><AnimatePresence>{gain > 0 && <motion.b className="score-gain" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -15 }} exit={{ opacity: 0, y: -31 }} transition={{ duration: .55 }}>+{number(gain)}</motion.b>}</AnimatePresence></div>;
}

export function UiSwitch({ mode, onChange }: { mode: UiMode; onChange: (mode: UiMode) => void }) {
  return <div className={`ui-switch ui-switch--${mode}`} role="radiogroup" aria-label="Display style">
    <span className="ui-switch-thumb" aria-hidden="true" />
    {(['broadcast', 'arena'] as const).map(option => <button key={option} role="radio" aria-checked={mode === option} className={mode === option ? 'active' : ''} onClick={() => onChange(option)}>{option.toUpperCase()}</button>)}
  </div>;
}

export type RankTier = 'radiant' | 'immortal' | 'ascendant' | 'diamond' | 'platinum' | 'gold' | 'silver' | 'bronze' | 'iron';
export const rankTiers: RankTier[] = ['radiant', 'immortal', 'ascendant'];
const ladder: RankTier[] = ['diamond', 'diamond', 'platinum', 'platinum', 'gold', 'gold', 'silver', 'silver', 'bronze', 'bronze'];
/** Valorant-style tier from this month's placement (0-based). 0 XP this month is unranked. */
export const tierForRank = (rank: number, xp = 1): RankTier | undefined => xp <= 0 ? undefined : rank < 3 ? rankTiers[rank] : ladder[rank - 3] || 'iron';
export const isTopTier = (tier?: RankTier) => tier === 'radiant' || tier === 'immortal' || tier === 'ascendant';

/** Valorant rank artwork served locally so the TV needs no external asset requests. */
export function RankEmblem({ tier, size = 40 }: { tier: RankTier; size?: number }) {
  return <img className={`rank-emblem rank-emblem--${tier}`} src={`/ranks/${tier}.png`} width={size} height={size} alt="" aria-hidden="true" draggable={false}/>;
}

export function RankTierChip({ rank, xp = 1, size = 20 }: { rank: number; xp?: number; size?: number }) {
  const tier = tierForRank(rank, xp);
  return tier ? <span className={`rank-tier rank-tier--${tier}`}><RankEmblem tier={tier} size={size}/>{tier.toUpperCase()}</span> : null;
}

/** "+2,640 XP LEAD" for #1, otherwise what it takes to pass the player above. */
export function rankGap(ranked: Member[], stats: Record<string, DevStats>, rank: number): string {
  const xpOf = (i: number) => stats[ranked[i]?.login]?.monthlyXp || 0;
  if (!ranked[rank]) return '';
  if (rank === 0) return ranked[1] ? `+${number(xpOf(0) - xpOf(1))} XP LEAD` : '';
  const need = xpOf(rank - 1) - xpOf(rank) + 1;
  const target = tierForRank(rank - 1, xpOf(rank - 1));
  return target && target !== tierForRank(rank, xpOf(rank)) ? `${number(need)} XP TO ${target.toUpperCase()}` : `${number(need)} XP TO #${rank}`;
}
