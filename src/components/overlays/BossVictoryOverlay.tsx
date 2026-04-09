import { motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';

interface Props {
  onDone: () => void;
}

function generateConfetti(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: ['#22c55e', '#3b82f6', '#f59e0b', '#a78bfa', '#ef4444'][Math.floor(Math.random() * 5)],
    size: 4 + Math.random() * 6,
  }));
}

export function BossVictoryOverlay({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  const confetti = useMemo(() => generateConfetti(50), []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Confetti */}
      {confetti.map((c) => (
        <motion.div
          key={c.id}
          className="absolute rounded-sm"
          style={{
            left: `${c.x}%`,
            top: -10,
            width: c.size,
            height: c.size,
            backgroundColor: c.color,
          }}
          animate={{
            y: [0, 1100],
            rotate: [0, 360 + Math.random() * 360],
            opacity: [1, 0],
          }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease: 'easeIn',
          }}
        />
      ))}

      <motion.div
        className="bg-raised border border-green/30 rounded-[12px] p-12 flex flex-col items-center gap-4 z-10 glow-green"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
      >
        <span className="text-[48px] animate-pulse-glow">👾</span>
        <span className="font-mono text-[10px] text-green uppercase tracking-[4px] font-medium">
          boss defeated
        </span>
        <span className="text-[28px] font-medium shimmer-text">
          Team Victory!
        </span>
        <span className="font-mono text-[14px] text-t2">
          All goals completed this week ✅
        </span>
      </motion.div>
    </motion.div>
  );
}
