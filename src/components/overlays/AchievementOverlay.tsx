import { motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { getBadgeDef } from '../../lib/badges';
import { sfxAchievement } from '../../lib/sounds';

interface Props {
  login: string;
  badgeId: string;
  onDone: () => void;
}

function generateParticles(count: number, rarity: string) {
  const colors: Record<string, string[]> = {
    common: ['#3b82f6', '#06b6d4', '#60a5fa'],
    rare: ['#a78bfa', '#c084fc', '#818cf8'],
    legendary: ['#FFD700', '#FFA500', '#FFEC8B', '#ef4444'],
  };
  const palette = colors[rarity] || colors.common;
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (360 / count) * i + Math.random() * 20,
    distance: 80 + Math.random() * 120,
    size: 3 + Math.random() * 5,
    color: palette[Math.floor(Math.random() * palette.length)],
    delay: Math.random() * 0.3,
    duration: 0.8 + Math.random() * 0.6,
  }));
}

const RARITY_CONFIG = {
  common: { ring: 'achievement-ring-common', duration: 3000, particleCount: 30, textGlow: 'neon-text-cyan' },
  rare: { ring: 'achievement-ring-rare', duration: 4000, particleCount: 50, textGlow: 'neon-text-purple' },
  legendary: { ring: 'achievement-ring-legendary', duration: 5000, particleCount: 80, textGlow: 'neon-text-gold' },
};

export function AchievementOverlay({ login, badgeId, onDone }: Props) {
  const members = useStore((s) => s.members);
  const member = members.find((m) => m.login === login);
  const badge = getBadgeDef(badgeId);

  const rarity = badge?.rarity || 'common';
  const config = RARITY_CONFIG[rarity];
  const particles = useMemo(() => generateParticles(config.particleCount, rarity), [config.particleCount, rarity]);

  useEffect(() => {
    sfxAchievement(rarity);
    const t = setTimeout(onDone, config.duration);
    return () => clearTimeout(t);
  }, [onDone, config.duration, rarity]);

  if (!badge) return null;

  const isLegendary = rarity === 'legendary';

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex items-center justify-center achievement-backdrop ${isLegendary ? 'animate-screen-shake' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative flex flex-col items-center" style={{ zIndex: 10 }}>
        {/* Particle burst */}
        {particles.map((p) => {
          const rad = (p.angle * Math.PI) / 180;
          const x = Math.cos(rad) * p.distance;
          const y = Math.sin(rad) * p.distance;
          return (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                left: '50%',
                top: '50%',
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x, y, opacity: 0, scale: 0.3 }}
              transition={{ duration: p.duration, delay: 0.3 + p.delay, ease: 'easeOut' }}
            />
          );
        })}

        {/* User avatar + name above */}
        <motion.div
          className="flex items-center gap-3 mb-6"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {member?.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name} className="w-[36px] h-[36px] rounded-full object-cover" />
          ) : (
            <div
              className="w-[36px] h-[36px] rounded-full flex items-center justify-center font-mono text-[12px] font-medium text-bg"
              style={{ backgroundColor: member?.color || '#444' }}
            >
              {(member?.name || login).slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="text-[20px] font-medium text-t1">{member?.name || login}</span>
        </motion.div>

        {/* Badge icon — spring scale */}
        <motion.div
          className={`w-[120px] h-[120px] rounded-full flex items-center justify-center bg-raised ${config.ring}`}
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        >
          <span className="text-[56px]">{badge.icon}</span>
        </motion.div>

        {/* Badge name — typewriter reveal */}
        <motion.div
          className={`mt-6 font-mono text-[13px] uppercase tracking-[4px] font-medium ${config.textGlow}`}
          style={{ color: rarity === 'legendary' ? '#FFD700' : rarity === 'rare' ? '#a78bfa' : '#06b6d4' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          achievement unlocked
        </motion.div>

        <motion.div
          className={`mt-2 text-[32px] font-medium ${rarity === 'legendary' ? 'text-gold neon-text-gold' : 'text-t1'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
        >
          {badge.name}
        </motion.div>

        <motion.div
          className="mt-1 font-mono text-[14px] text-t2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.4 }}
        >
          {badge.desc}
        </motion.div>

        {/* Rarity tag */}
        <motion.div
          className={`mt-3 font-mono text-[10px] uppercase tracking-wider px-3 py-1 rounded-full ${
            rarity === 'legendary' ? 'bg-gold/20 text-gold' :
            rarity === 'rare' ? 'bg-purple/20 text-purple' :
            'bg-cyan/20 text-cyan'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.3 }}
        >
          {rarity}
        </motion.div>
      </div>
    </motion.div>
  );
}
