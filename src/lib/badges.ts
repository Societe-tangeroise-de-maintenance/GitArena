import type { BadgeDef } from '../types';

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'earlyBird',    name: 'Early Bird',    icon: '🐦', rarity: 'common',    desc: 'first commit before 9am'          },
  { id: 'nightOwl',     name: 'Night Owl',     icon: '🦉', rarity: 'common',    desc: 'commit after 11pm'                },
  { id: 'quickDraw',    name: 'Quick Draw',    icon: '⚡', rarity: 'common',    desc: 'PR reviewed within 1h'            },
  { id: 'closer',       name: 'Closer',        icon: '🎯', rarity: 'common',    desc: '5 issues in a day'                },
  { id: 'surgeon',      name: 'The Surgeon',   icon: '🔪', rarity: 'rare',      desc: 'PR with >90% deletions'           },
  { id: 'streakMaster', name: 'Streak Master', icon: '🔥', rarity: 'rare',      desc: '7-day commit streak'              },
  { id: 'reviewerWeek', name: 'Top Reviewer',  icon: '👁️', rarity: 'rare',      desc: 'most reviews this week'           },
  { id: 'speedDemon',   name: 'Speed Demon',   icon: '💨', rarity: 'rare',      desc: 'PR merged within 2h'              },
  { id: 'janitor',      name: 'The Janitor',   icon: '🧹', rarity: 'legendary', desc: 'delete more than add in a month'  },
  { id: 'ghostSlayer',  name: 'Ghost Slayer',  icon: '⚔️', rarity: 'legendary', desc: '10+ issues in a week'             },
  { id: 'ironDev',      name: 'Iron Dev',      icon: '🛡️', rarity: 'legendary', desc: '30-day commit streak'             },
  { id: 'theWall',      name: 'The Wall',      icon: '🧱', rarity: 'legendary', desc: 'no PR unreviewed >4h all week'    },
];

export function getBadgeDef(id: string): BadgeDef | undefined {
  return BADGE_DEFS.find(b => b.id === id);
}
