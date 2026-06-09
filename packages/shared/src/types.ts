// DTOs returned by the API and consumed by the Mini App + admin dashboard.
import type { MemberType } from "./gamify";

export interface BadgeView {
  code: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
  earnedAt?: string | null;
}

export interface MeResponse {
  linked: boolean;
  type: MemberType;
  metricLabel: string; // "Bonus" (client) | "Balans" (driver)
  member: {
    id: number;
    fullName: string;
    phone?: string | null;
    carNumber?: string | null;
  };
  stats: {
    points: number;
    trips: number;
    rating: number;
  };
  level: { index: number; name: string; emoji: string; color: string };
  nextLevel: { index: number; name: string; emoji: string; minXp: number } | null;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number | null;
  progress: number;
  rank: number | null;
  totalMembers: number;
  badges: BadgeView[];
}

export interface LeaderboardEntry {
  rank: number;
  memberId: number;
  fullName: string;
  carNumber?: string | null;
  points: number;
  trips: number;
  level: { name: string; emoji: string; color: string };
  isMe: boolean;
}

export interface LeaderboardResponse {
  type: MemberType;
  metricLabel: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface AdminStats {
  type: MemberType;
  metricLabel: string;
  totalMembers: number;
  activeMembers: number;
  linkedMembers: number;
  pointsSum: number;
  tripsSum: number;
  lastSync: { at: string | null; status: string; source: string; membersSeen: number } | null;
  topMembers: LeaderboardEntry[];
}

export interface AdminBotUser {
  telegramId: string;
  name: string;
  username: string | null;
  phone: string | null;
  linked: boolean;
  memberType: MemberType | null;
  memberName: string | null;
  isAdmin: boolean;
  linkedAt: string | null;
  lastActive: string;
}

export interface AdminBotUsersResponse {
  total: number;
  linked: number;
  admins: number;
  newToday: number;
  users: AdminBotUser[];
}

export interface AdminMemberRow {
  id: number;
  kasId: string;
  type: MemberType;
  fullName: string;
  phone?: string | null;
  carNumber?: string | null;
  points: number;
  trips: number;
  rating: number;
  level: { name: string; emoji: string };
  linked: boolean;
  active: boolean;
  lastSyncAt: string | null;
}
