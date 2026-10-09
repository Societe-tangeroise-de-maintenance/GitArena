import type { ReactNode } from 'react';

export type IconName = 'arena' | 'git' | 'merge' | 'review' | 'issue' | 'trophy' | 'flame' | 'target' | 'chart' | 'volume' | 'mute' | 'medal' | 'clock' | 'users' | 'spark' | 'arrow' | 'shield' | 'check' | 'branch' | 'star' | 'alert' | 'expand' | 'code' | 'bolt' | 'lock' | 'hex' | 'layers' | 'settings' | 'close' | 'city';

const paths: Record<IconName, ReactNode> = {
  settings: <><path d="m9 3-1 3-3 1v4l-2 1 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  city: <><path d="M3 21h18M4 21V9h6v12m0-16h7v16m0-8h4v8M6 12h2m-2 4h2m5-8h1m-1 4h1m-1 4h1"/></>,
  arena: <><path d="M4 19 12 3l8 16H4Z"/><path d="m8 15 4-8 4 8H8Z"/><path d="M3 21h18"/></>,
  git: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 5h4a6 6 0 0 1 6 6v-2"/></>,
  merge: <><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10m12 0v-4a6 6 0 0 0-6-6H8"/></>,
  review: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  issue: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></>,
  trophy: <><path d="M7 4h10v7a5 5 0 0 1-10 0V4Zm0 2H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4M12 16v4m-4 0h8"/></>,
  flame: <><path d="M13 3c1 4-2 5-1 8 2-1 3-3 3-5 3 3 5 6 5 9a8 8 0 0 1-16 0c0-4 3-7 9-12Z"/><path d="M12 13c1 2 3 3 3 5a3 3 0 0 1-6 0c0-2 1-3 3-5Z"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  chart: <><path d="M3 19h18M5 15l5-5 4 3 5-7"/><path d="M16 6h3v3"/></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9H4Zm12-1a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14"/></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 5 5m0-5-5 5"/></>,
  medal: <><circle cx="12" cy="15" r="5"/><path d="M8 11 5 3h5l2 5 2-5h5l-3 8m-4 2v4m-2-2h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm13-15a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5h-4"/></>,
  spark: <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  shield: <><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/></>,
  check: <><path d="m4 12 5 5L20 6"/></>,
  branch: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v8a4 4 0 0 0 4 4h6M8 5h4a6 6 0 0 1 6 6v6"/></>,
  star: <><path d="m12 2 3 6.5 7 .9-5 5 .9 7-5.9-3.3-5.9 3.3.9-7-5-5 7-.9L12 2Z"/></>,
  alert: <><path d="m12 3 10 18H2L12 3Zm0 7v4m0 3h.01"/></>,
  expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></>,
  code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20"/></>,
  bolt: <><path d="m13 2-9 11h7l-1 9 10-12h-7l0-8Z"/></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3m-4 4v2"/></>,
  hex: <><path d="m12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></>,
};

export function ArenaIcon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
