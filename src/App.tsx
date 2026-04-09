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
import { AchievementOverlay } from './components/overlays/AchievementOverlay';
import { Particles } from './components/effects/Particles';
import { EventFlash } from './components/effects/EventFlash';
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

  // Detect fullscreen and add brightness-compensation class
  useEffect(() => {
    function onFs() {
      document.documentElement.classList.toggle(
        'fullscreen-active',
        !!document.fullscreenElement || !!(document as unknown as Record<string, unknown>).webkitFullscreenElement,
      );
    }
    // Also detect F11 via resize heuristic (window matches screen size = fullscreen)
    function onResize() {
      const isFs =
        !!document.fullscreenElement ||
        (window.innerWidth === screen.width && window.innerHeight === screen.height);
      document.documentElement.classList.toggle('fullscreen-active', isFs);
    }
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('resize', onResize);
    onResize(); // check on mount
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      window.removeEventListener('resize', onResize);
    };
  }, []);

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
      className="w-full h-full grid relative"
      style={{
        gridTemplateColumns: '420px 1fr 340px',
        gridTemplateRows: '56px 1fr 280px',
      }}
    >
      {/* Ambient particles */}
      <Particles />
      {/* Event flash overlay */}
      <EventFlash />

      {/* Row 1: TopBar */}
      <div className="col-span-3 neon-border-b relative z-10">
        <TopBar />
      </div>

      {/* Row 2: Main panels */}
      <div className="neon-border-r overflow-hidden relative z-10">
        <Leaderboard />
      </div>
      <div className="neon-border-r overflow-hidden relative z-10">
        <ActivityFeed />
      </div>
      <div className="overflow-hidden relative z-10">
        <StatsPanel />
      </div>

      {/* Row 3: Spotlight */}
      <div className="col-span-3 neon-border-t relative z-10">
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
      {overlay?.type === 'achievement' && (
        <AchievementOverlay
          login={overlay.payload.login as string}
          badgeId={overlay.payload.badgeId as string}
          onDone={popOverlay}
        />
      )}
    </div>
  );
}
