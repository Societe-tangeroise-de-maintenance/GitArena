import { create } from 'zustand';

export interface DisplayPreferences {
  scene: 'spaceship' | 'city';
  missionName: string;
  destinationName: string;
  goalLabels: Record<string, string>;
  rotationSeconds: number;
  takeoverSeconds: number;
  calmMotion: boolean;
  companionEnabled: boolean;
  companionName: string;
}
export const DEFAULT_DISPLAY: DisplayPreferences = {
  scene: 'spaceship', missionName: 'Team mission', destinationName: 'New horizon',
  goalLabels: {}, rotationSeconds: 6.5, takeoverSeconds: 300, calmMotion: false, companionEnabled: true, companionName: 'Patch',
};
const KEY = 'gitarena-display-settings';
export const goalDisplayKey = (goal: { metric: string; target: number }) => `${goal.metric}:${goal.target}`;
export function cleanDisplayPreferences(input: unknown): DisplayPreferences {
  const d = (input && typeof input === 'object' ? input : {}) as Partial<DisplayPreferences>;
  const text = (value: unknown, fallback: string, length = 60) => typeof value === 'string' && value.trim() ? value.trim().slice(0, length) : fallback;
  const labels = Object.fromEntries(Object.entries(d.goalLabels && typeof d.goalLabels === 'object' ? d.goalLabels : {}).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, text(value, '', 80)]));
  return { scene: d.scene === 'city' ? 'city' : 'spaceship', missionName: text(d.missionName, DEFAULT_DISPLAY.missionName), destinationName: text(d.destinationName, DEFAULT_DISPLAY.destinationName), goalLabels: labels,
    rotationSeconds: [6.5,10,15].includes(Number(d.rotationSeconds)) ? Number(d.rotationSeconds) : 6.5,
    takeoverSeconds: [300,600,900].includes(Number(d.takeoverSeconds)) ? Number(d.takeoverSeconds) : 300,
    calmMotion: d.calmMotion === true, companionEnabled: d.companionEnabled !== false, companionName: text(d.companionName, 'Patch', 18) };
}
function read(): DisplayPreferences {
  try { return cleanDisplayPreferences(JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return { ...DEFAULT_DISPLAY, goalLabels: {} }; }
}
interface DisplayState {
  preferences: DisplayPreferences;
  open: boolean;
  show: () => void;
  close: () => void;
  save: (preferences: DisplayPreferences) => void;
}
export const useDisplaySettings = create<DisplayState>(set => ({
  preferences: read(), open: false,
  show: () => set({open: true}), close: () => set({open: false}),
  save: input => {
    const preferences = cleanDisplayPreferences(input);
    try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Use settings for this session if storage is unavailable. */ }
    set({preferences, open: false});
  },
}));
