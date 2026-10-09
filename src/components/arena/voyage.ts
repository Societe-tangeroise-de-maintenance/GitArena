import type { BossGoal } from '../../types';

export const ENCOUNTERS = [
  { start: 25, end: 35, name: 'The Interceptor', sector: 'Debris field' },
  { start: 50, end: 60, name: 'The Warden', sector: 'Ion storm' },
  { start: 75, end: 85, name: 'The Dreadnought', sector: 'Outer perimeter' },
] as const;

export function voyageState(goals: BossGoal[], progress: Record<string, number>) {
  const valid = goals.filter(g => Number.isFinite(g.target) && g.target > 0);
  const ratio = valid.length ? valid.reduce((sum, g) => {
    const value = progress[g.metric] || 0;
    return sum + Math.min(1, Math.max(0, Number.isFinite(value) ? value / g.target : 0));
  }, 0) / valid.length : 0;
  const percent = Math.min(100, ratio * 100);
  const encounter = ENCOUNTERS.find(e => percent >= e.start && percent < e.end);
  return {
    percent,
    encounter,
    health: encounter ? Math.ceil((encounter.end - percent) / (encounter.end - encounter.start) * 100) : 0,
    defeated: ENCOUNTERS.filter(e => percent >= e.end).length,
    arrived: percent >= 100 - 1e-8,
    configured: valid.length > 0,
  };
}
