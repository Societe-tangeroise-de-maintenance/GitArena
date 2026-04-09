import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';

const FLASH_COLORS: Record<string, string> = {
  'commit': 'rgba(59,130,246,0.08)',
  'pr-opened': 'rgba(167,139,250,0.10)',
  'pr-merged': 'rgba(34,197,94,0.12)',
  'review': 'rgba(20,184,166,0.08)',
  'issue': 'rgba(245,158,11,0.10)',
  'issue-opened': 'rgba(6,182,212,0.08)',
  'badge': 'rgba(255,215,0,0.15)',
  'streak': 'rgba(239,68,68,0.10)',
  'level-up': 'rgba(255,215,0,0.18)',
};

export function EventFlash() {
  const feed = useStore((s) => s.feed);
  const [flash, setFlash] = useState<string | null>(null);
  const lastFeedLen = useRef(feed.length);

  useEffect(() => {
    if (feed.length > lastFeedLen.current && feed.length > 0) {
      const latest = feed[0];
      if (latest) {
        const color = FLASH_COLORS[latest.type] || 'rgba(255,255,255,0.05)';
        setFlash(color);
        const t = setTimeout(() => setFlash(null), 400);
        return () => clearTimeout(t);
      }
    }
    lastFeedLen.current = feed.length;
  }, [feed]);

  return (
    <AnimatePresence>
      {flash && (
        <motion.div
          key={flash + Date.now()}
          className="fixed inset-0 pointer-events-none z-40"
          style={{ background: flash }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  );
}
