export type Position = "defender" | "forward";
export type Team = "blue" | "red";
export type Role = "admin" | "player";
export interface Player {
  account_id?: string | null;
  id: string;
  league_id: string;
  name: string;
  avatar_url: string | null;
  active: boolean;
}
export interface Rules {
  minimum: number;
  prior_wins: number;
  prior_games: number;
  pair_minimum: number;
  target: number;
}
export interface Season extends Rules {
  id: string;
  league_id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  status: "active" | "closed";
  final_results: unknown;
}
export interface Participant {
  player_id: string;
  team: Team;
  position: Position;
}
export interface Match {
  id: string;
  league_id: string;
  season_id: string;
  blue_score: number | null;
  red_score: number | null;
  winner: Team;
  played_at: string;
  created_at: string;
  created_by: string;
  status: "valid" | "void";
  operation_id: string;
  participants: Participant[];
  revision: number;
}
export interface MatchInput {
  operation_id: string;
  season_id: string;
  blue_score: number | null;
  red_score: number | null;
  winner?: Team;
  participants: Participant[];
}
export interface Membership {
  user_id: string;
  role: Role;
  active: boolean;
  display_name: string;
}
export interface Audit {
  id: string;
  action: string;
  created_at: string;
  actor_id: string;
  entity_id: string;
  before_data: unknown;
  after_data: unknown;
}
export interface Snapshot {
  league: { id: string; name: string };
  players: Player[];
  seasons: Season[];
  matches: Match[];
  memberships: Membership[];
  audit: Audit[];
  role: Role;
}
export interface Stats {
  player: Player;
  games: number;
  wins: number;
  losses: number;
  raw: number;
  adjusted: number;
  streak: number;
  bestStreak: number;
  qualified: boolean;
}
export const defaultRules: Rules = {
  minimum: 10,
  prior_wins: 10,
  prior_games: 20,
  pair_minimum: 10,
  target: 3,
};
