import { motion } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  login: string;
  newRank: number;
  onDone: () => void;
}

export function OvertakenPill({ login, newRank, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2"
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      <div className="bg-raised border border-green/30 rounded-full px-5 py-2 flex items-center gap-3 glow-green">
        <span className="font-mono text-[11px] text-green font-medium">⬆️</span>
        <span className="text-[13px] font-medium text-t1">{login}</span>
        <span className="font-mono text-[11px] text-green font-medium">
          moved to #{newRank}
        </span>
      </div>
    </motion.div>
  );
}
