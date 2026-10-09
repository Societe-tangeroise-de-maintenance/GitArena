export const COMPANION_TRIP_MS = 14000;
export type RoutePhase = 'depart' | 'outbound' | 'work' | 'return' | 'charge' | 'rest';
export interface CompanionRoute {
  phase: RoutePhase;
  moving: boolean;
  location: 'dock' | 'target';
  waypoint: number;
  idleActivity: 'wander' | 'garden' | 'watch' | 'nap';
}
/** A real task gets time to travel, work, and come home before the queue advances. */
export function companionRoute(hasTask: boolean, elapsedMs: number, hasFailures: boolean): CompanionRoute {
  const elapsed = Math.max(0, elapsedMs);
  if (hasTask) {
    const phase: RoutePhase = elapsed < 2800 ? 'depart' : elapsed < 5600 ? 'outbound' : elapsed < 10000 ? 'work' : elapsed < 12800 ? 'return' : 'charge';
    return { phase, moving: phase === 'depart' || phase === 'outbound' || phase === 'return', location: phase === 'outbound' || phase === 'work' ? 'target' : 'dock', waypoint: 50, idleActivity: 'watch' };
  }
  if (elapsed >= 45000 && !hasFailures) return { phase: 'rest', moving: false, location: 'dock', waypoint: 50, idleActivity: 'nap' };
  if (elapsed < 3000) return {phase:'charge',moving:false,location:'dock',waypoint:50,idleActivity:'watch'};
  const patrol = elapsed - 3000, stop = Math.floor(patrol / 14000) % 3, leg = patrol % 14000;
  const phase: RoutePhase = leg < 3500 ? 'outbound' : leg < 10000 ? 'work' : 'return';
  return { phase, moving: phase !== 'work', location: phase === 'return' ? 'dock' : 'target', waypoint:[78,35,62][stop], idleActivity: phase !== 'work' ? 'wander' : hasFailures || stop !== 1 ? 'watch' : 'garden' };
}
