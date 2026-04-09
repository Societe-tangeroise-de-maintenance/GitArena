export const XP_VALUES = {
  commit: 50,
  prOpened: 80,
  prMerged: 120,
  prReviewed: 60,
  issueClosed: 40,
  issueOpened: 20,
  firstCommit: 30,
  netNegativePR: 70,
  streakBonus: 200,
};

export const LEVELS = [
  { level: 1, xp: 0,     title: 'intern'    },
  { level: 2, xp: 500,   title: 'junior'    },
  { level: 3, xp: 1500,  title: 'dev'       },
  { level: 4, xp: 3000,  title: 'senior'    },
  { level: 5, xp: 6000,  title: 'staff'     },
  { level: 6, xp: 10000, title: 'principal' },
  { level: 7, xp: 16000, title: 'architect' },
  { level: 8, xp: 25000, title: 'legendary' },
];

export function getLevel(totalXp: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (totalXp >= l.xp) current = l;
    else break;
  }
  return current;
}

export function getNextLevel(totalXp: number) {
  for (const l of LEVELS) {
    if (totalXp < l.xp) return l;
  }
  return null;
}

export function getLevelProgress(totalXp: number): number {
  const current = getLevel(totalXp);
  const next = getNextLevel(totalXp);
  if (!next) return 1;
  return (totalXp - current.xp) / (next.xp - current.xp);
}
