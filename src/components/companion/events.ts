import type { CiAlert, FeedItem } from '../../types';
export type CompanionAction = 'delivery' | 'review' | 'inspection' | 'repair';
export interface CompanionMoment {
  id: string;
  action: CompanionAction;
  repo: string;
  user?: string;
  time: number;
}
export function feedMoment(item: FeedItem, now: number): CompanionMoment | null {
  const time = Date.parse(item.time);
  if (!Number.isFinite(time) || now - time < -5000 || now - time > 120000 || !item.repo) return null;
  const action = item.type === 'pr-merged' ? 'delivery' : item.type === 'review' ? 'review' : null;
  return action ? {id:item.id, action, repo:item.repo, user:item.user, time} : null;
}
export function ciTransitions(previous: CiAlert[], current: CiAlert[], now: number): CompanionMoment[] {
  const key = (a: CiAlert) => `${a.repo}:${a.branch}`;
  const before = new Map(previous.map(a => [key(a), a]));
  const after = new Map(current.map(a => [key(a), a]));
  const moments: CompanionMoment[] = [];
  for (const [id, alert] of after) if (!before.has(id) && !previous.some(a => a.repo === alert.repo) && !moments.some(m => m.repo === alert.repo)) moments.push({id:`inspect:${id}:${now}`, action:'inspection', repo:alert.repo, time:now});
  // A branch recovery is only a building repair once every branch there is green.
  for (const [id, alert] of before) if (!after.has(id) && !current.some(a => a.repo === alert.repo) && !moments.some(m => m.action === 'repair' && m.repo === alert.repo)) moments.push({id:`repair:${id}:${now}`, action:'repair', repo:alert.repo, time:now});
  return moments;
}
