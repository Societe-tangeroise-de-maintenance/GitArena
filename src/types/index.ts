export interface Member {
  login: string;
  name: string;
  color: string;
  avatarUrl: string;
}

export interface DevStats {
  login: string;
  weeklyXp: number;
  totalXp: number;
  weeklyCommits: number;
  weeklyPRsOpened: number;
  weeklyPRsMerged: number;
  weeklyPRsReviewed: number;
  weeklyIssuesClosed: number;
  weeklyLinesAdded: number;
  weeklyLinesDeleted: number;
  dailyCommits: number;
  dailyIssuesClosed: number;
  streak: number;
  longestStreak: number;
  streakLastDate: string | null;
  lastActivityTime: string | null;
  lastCommitDate: string | null;
  badges: string[];
}

export interface FeedItem {
  id: string;
  type: 'commit' | 'pr-opened' | 'pr-merged' | 'review' | 'issue' | 'badge' | 'streak' | 'level-up';
  user: string;
  repo: string;
  message: string;
  detail: string;
  xp: number;
  time: string;
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'rare' | 'legendary';
  desc: string;
}

export interface BossGoal {
  label: string;
  metric: 'issuesClosed' | 'prsMerged' | 'commits';
  target: number;
}

export interface Belts {
  reviewer: string | null;
  closer: string | null;
  speedKing: string | null;
}

export interface ShamePR {
  title: string;
  repo: string;
  author: string;
  age: number;
}
