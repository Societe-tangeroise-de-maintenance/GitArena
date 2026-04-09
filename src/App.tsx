import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { TopBar } from './components/layout/TopBar';
import { Leaderboard } from './components/leaderboard/Leaderboard';
import { ActivityFeed } from './components/feed/ActivityFeed';
import { StatsPanel } from './components/stats/StatsPanel';
import { Spotlight } from './components/spotlight/Spotlight';
import { LevelUpOverlay } from './components/overlays/LevelUpOverlay';
import { BossVictoryOverlay } from './components/overlays/BossVictoryOverlay';
import { OvertakenPill } from './components/overlays/OvertakenPill';
import { useGitHubPoller } from './hooks/useGitHubPoller';
import { useFullSync } from './hooks/useFullSync';
import { useDemoMode } from './hooks/useDemoMode';
import { useOrgMembers } from './hooks/useOrgMembers';

export default function App() {
  const hydrate = useStore((s) => s.hydrate);
  const checkWeeklyReset = useStore((s) => s.checkWeeklyReset);
  const overlayQueue = useStore((s) => s.overlayQueue);
  const popOverlay = useStore((s) => s.popOverlay);

  useEffect(() => {
    hydrate();
    checkWeeklyReset();
  }, [hydrate, checkWeeklyReset]);

  // Persist every 10s
  const persist = useStore((s) => s.persist);
  useEffect(() => {
    const id = setInterval(persist, 10_000);
    return () => clearInterval(id);
  }, [persist]);

  useGitHubPoller();
  useFullSync();
  useDemoMode();
  useOrgMembers();

  // Spotlight auto-rotate
  const nextSpotlight = useStore((s) => s.nextSpotlight);
  useEffect(() => {
    const id = setInterval(nextSpotlight, 12_000);
    return () => clearInterval(id);
  }, [nextSpotlight]);

  const overlay = overlayQueue[0];

  return (
    <div
      className="w-[1920px] h-[1080px] grid"
      style={{
        gridTemplateColumns: '360px 1fr 300px',
        gridTemplateRows: '56px 1fr 220px',
      }}
    >
      {/* Row 1: TopBar */}
      <div className="col-span-3 border-b border-border">
        <TopBar />
      </div>

      {/* Row 2: Main panels */}
      <div className="border-r border-border overflow-hidden">
        <Leaderboard />
      </div>
      <div className="border-r border-border overflow-hidden">
        <ActivityFeed />
      </div>
      <div className="overflow-hidden">
        <StatsPanel />
      </div>

      {/* Row 3: Spotlight */}
      <div className="col-span-3 border-t border-border">
        <Spotlight />
      </div>

      {/* Overlays */}
      {overlay?.type === 'level-up' && (
        <LevelUpOverlay
          login={overlay.payload.login as string}
          level={overlay.payload.level as number}
          title={overlay.payload.title as string}
          onDone={popOverlay}
        />
      )}
      {overlay?.type === 'boss-victory' && (
        <BossVictoryOverlay onDone={popOverlay} />
      )}
      {overlay?.type === 'overtaken' && (
        <OvertakenPill
          login={overlay.payload.login as string}
          newRank={overlay.payload.newRank as number}
          onDone={popOverlay}
        />
      )}
    </div>
  );
}
