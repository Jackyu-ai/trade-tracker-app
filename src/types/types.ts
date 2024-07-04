export interface Transaction {
  transaction_id: string;
  type: string;
  status: string;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: DraftPick[];
}

export interface User {
  user_id: string;
  display_name: string;
}

export interface Player {
  player_id: string;
  full_name: string;
  position: string;
}

export interface Roster {
  roster_id: number;
  owner_id: string;
}

export interface DraftPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
}

export interface League {
  league_id: string;
  season: string;
  name: string;
  draft_id: string;
}

export interface DraftPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
  pick: number; // This is likely the property name for the pick number
}

export const BASE_URL = 'https://api.sleeper.app/v1';