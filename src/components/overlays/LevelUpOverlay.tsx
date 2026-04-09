import { motion } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  login: string;
  level: number;
  title: string;
  onDone: () => void;
}

export function LevelUpOverlay({ login, level, title, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-raised border border-gold/30 rounded-[12px] p-10 flex flex-col items-center gap-3 glow-gold"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
      >
        <span className="text-[32px] animate-pulse-glow">⭐</span>
        <span className="font-mono text-[10px] text-gold uppercase tracking-[4px] font-medium">
          level up
        </span>
        <span className="text-[28px] font-medium shimmer-text">{login}</span>
        <span className="font-mono text-[48px] text-gold font-medium">LEVEL {level}</span>
        <span className="font-mono text-[16px] text-t2">{title}</span>
      </motion.div>
    </motion.div>
  );
}
