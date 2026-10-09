import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useStore } from '../../store/useStore';
import { useDisplaySettings } from '../../store/useDisplaySettings';
import { ciTransitions, feedMoment, type CompanionMoment } from './events';
import { COMPANION_TRIP_MS } from './route';
import type { CiAlert } from '../../types';
interface CompanionState { moment: CompanionMoment | null; lastActionAt: number; }
export const useCompanion = create<CompanionState>(() => ({moment:null, lastActionAt:Date.now()}));

/** Mounted once above the scenes: switching worlds never replays an event. */
export function CompanionDirector() {
  const feed = useStore(s => s.feed), alerts = useStore(s => s.ciAlerts);
  const enabled = useDisplaySettings(s => s.preferences.companionEnabled);
  const moment = useCompanion(s => s.moment);
  const [queue, setQueue] = useState<CompanionMoment[]>([]);
  const seen = useRef<Set<string> | null>(null), previousAlerts = useRef<CiAlert[]>([]);
  useEffect(() => {
    if (!feed.length) return;
    if (!seen.current) { seen.current = new Set(feed.map(f => f.id)); return; }
    const next = feed.filter(f => !seen.current!.has(f.id)).map(f => feedMoment(f, Date.now())).filter((m): m is CompanionMoment => m !== null).sort((a,b) => a.time-b.time);
    seen.current = new Set(feed.map(f => f.id));
    if (enabled && next.length) setQueue(q => [...q,...next].slice(-8));
  }, [feed, enabled]);
  useEffect(() => {
    const next = ciTransitions(previousAlerts.current, alerts, Date.now());
    previousAlerts.current = alerts;
    if (enabled && next.length) setQueue(q => [...next,...q].slice(0,8));
  }, [alerts, enabled]);
  useEffect(() => {
    if (!enabled) { if (queue.length) setQueue([]); if (moment) useCompanion.setState({moment:null}); return; }
    if (!moment && queue.length) {
      const [next,...rest] = queue;
      setQueue(rest);
      if (Date.now()-next.time <= 120000) useCompanion.setState({moment:next, lastActionAt:Date.now()});
    }
  }, [enabled, queue, moment]);
  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(() => useCompanion.setState({moment:null,lastActionAt:Date.now()}), COMPANION_TRIP_MS);
    return () => clearTimeout(timer);
  }, [moment]);
  return null;
}
