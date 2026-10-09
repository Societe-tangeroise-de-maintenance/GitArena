export interface Member {
  login: string;
  name: string;
  color: string;
  avatarUrl: string;
}

export interface DevStats {
  login: string;
  monthlyXp: number;
  totalXp: number;
  monthlyCommits: number;
  monthlyPRsOpened: number;
  monthlyPRsMerged: number;
  monthlyPRsReviewed: number;
  monthlyIssuesClosed: number;
  monthlyIssuesOpened: number;
  monthlyLinesAdded: number;
  monthlyLinesDeleted: number;
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
  type: 'commit' | 'branch-push' | 'pr-opened' | 'pr-merged' | 'review' | 'issue' | 'issue-opened' | 'badge' | 'streak' | 'level-up';
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

export interface SeasonRecap {
  month: string;
  teamXp: number;
  standings: Array<{ login: string; xp: number; commits: number; merges: number; reviews: number; streak: number }>;
}

export interface CiAlert {
  repo: string;
  branch: string;
  failing: boolean;
  workflow: string;
  url: string;
  since: string;
  actor?: string;
}
