import { useStore } from '../../store/useStore';
import { rankedLogins } from '../../store/useStore';
import { LeaderboardRow } from './LeaderboardRow';
import { AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';

export function Leaderboard() {
  const stats = useStore((s) => s.stats);
  const members = useStore((s) => s.members);
  const ranked = rankedLogins(stats);
  const scrollRef = useRef<HTMLDivElement>(null);

  const memberMap = new Map(members.map((m) => [m.login, m]));

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  // Auto-scroll only the rest section
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf: number;
    let scrollPos = 0;
    const speed = 0.2;

    function step() {
      if (!el) return;
      if (el.scrollHeight <= el.clientHeight) {
        raf = requestAnimationFrame(step);
        return;
      }
      scrollPos += speed;
      if (scrollPos >= el.scrollHeight - el.clientHeight) {
        scrollPos = 0;
      }
      el.scrollTop = scrollPos;
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rest.length]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-[14px]">🏆</span>
        <span className="font-mono text-[11px] text-t3 uppercase tracking-wider">
          leaderboard
        </span>
        <span className="font-mono text-[10px] text-t3 ml-auto">{ranked.length} players</span>
      </div>

      {/* Pinned top 3 */}
      <div className="shrink-0">
        <AnimatePresence>
          {top3.map((login, i) => {
            const member = memberMap.get(login);
            if (!member) return null;
            return (
              <LeaderboardRow
                key={login}
                login={login}
                rank={i + 1}
                color={member.color}
                name={member.name}
                avatarUrl={member.avatarUrl}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Scrollable rest */}
      {rest.length > 0 && (
        <>
          <div className="h-[1px] bg-border mx-4" />
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <AnimatePresence>
              {rest.map((login, i) => {
                const member = memberMap.get(login);
                if (!member) return null;
                return (
                  <LeaderboardRow
                    key={login}
                    login={login}
                    rank={i + 4}
                    color={member.color}
                    name={member.name}
                    avatarUrl={member.avatarUrl}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
