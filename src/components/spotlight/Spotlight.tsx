import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { SpotlightNav } from './SpotlightNav';
import { MVPPanel } from './panels/MVPPanel';
import { DuelPanel } from './panels/DuelPanel';
import { StreakWallPanel } from './panels/StreakWallPanel';
import { BadgePanel } from './panels/BadgePanel';
import { FunStatPanel } from './panels/FunStatPanel';
import { ShamePanel } from './panels/ShamePanel';
import { VelocityPanel } from './panels/VelocityPanel';
import { TrophyPanel } from './panels/TrophyPanel';

const PANELS = [
  MVPPanel,
  DuelPanel,
  StreakWallPanel,
  BadgePanel,
  FunStatPanel,
  ShamePanel,
  VelocityPanel,
  TrophyPanel,
];

export function Spotlight() {
  const mode = useStore((s) => s.spotlightMode);
  const setMode = useStore((s) => s.setSpotlightMode);

  const Panel = PANELS[mode] || MVPPanel;

  return (
    <div className="h-full flex">
      <SpotlightNav current={mode} onSelect={setMode} />
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="absolute inset-0 flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Panel />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
