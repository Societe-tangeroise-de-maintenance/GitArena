import { useStore } from '../../store/useStore';
import { FeedItem } from './FeedItem';
import { useRef, useEffect, useMemo } from 'react';

const PINNED_COUNT = 15;

export function ActivityFeed() {
  const feed = useStore((s) => s.feed);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort feed by time descending (newest first)
  const sorted = useMemo(
    () => [...feed].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [feed],
  );

  const pinnedItems = sorted.slice(0, PINNED_COUNT);
  const scrollItems = sorted.slice(PINNED_COUNT);

  // Auto-scroll only the overflow section
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf: number;
    let scrollPos = 0;
    const speed = 0.3;

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
  }, [scrollItems.length]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-[14px]">📡</span>
        <span className="font-mono text-[11px] text-t3 uppercase tracking-wider neon-text-cyan">
          live activity
        </span>
        {feed.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <span className="w-[6px] h-[6px] rounded-full bg-green animate-pulse" />
            <span className="font-mono text-[10px] text-green">live</span>
          </span>
        )}
      </div>

      {/* Latest events — pinned, static */}
      {pinnedItems.length > 0 && (
        <div className="shrink-0 max-h-[60%] overflow-hidden">
          <div className="px-4 py-1">
            <span className="font-mono text-[9px] text-green uppercase tracking-wider neon-text-green">latest</span>
          </div>
          {pinnedItems.map((item, i) => (
            <FeedItem key={item.id} item={item} isNew={i < 3} />
          ))}
        </div>
      )}

      {/* Older events — auto-scroll */}
      {scrollItems.length > 0 && (
        <>
          <div className="h-[1px] bg-border mx-4" />
          <div className="px-4 py-1">
            <span className="font-mono text-[9px] text-t3 uppercase tracking-wider">earlier</span>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {scrollItems.map((item) => (
              <FeedItem key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {feed.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 gap-2">
          <span className="text-[24px]">📡</span>
          <span className="text-t3 font-mono text-[12px]">waiting for events…</span>
        </div>
      )}
    </div>
  );
}
