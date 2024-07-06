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
  username: string;
  display_name: string;
  avatar: string;
  metadata: {
    team_name?: string;
    [key: string]: any;
  };
  is_owner: boolean;
  is_bot: boolean;
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
  player_id: string;
  owner_id: number;
  previous_owner_id: number;
}

export interface League {
  league_id: string;
  name: string;
  season: string;
  previous_league_id: string | null;
  status: string;
  sport: string;
  settings: {
    [key: string]: any;
  };
  scoring_settings: {
    [key: string]: any;
  };
  roster_positions: string[];
  draft_id: string;
}

export interface DraftPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
  pick_no: number; // This is likely the property name for the pick number
}

export const BASE_URL = 'https://api.sleeper.app/v1';