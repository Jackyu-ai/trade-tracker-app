import { Transaction, User, Player, Roster, League, DraftPick, BASE_URL } from '../types/types';

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`API Error (${response.status}):`, errorBody);
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
  }
  return response.json();
};

export const fetchAllTransactions = async (leagueId: string): Promise<Transaction[]> => {
  console.log(`Fetching all transactions for league ${leagueId}`);
  let allTransactions: Transaction[] = [];
  let week = 1;
  let hasMoreTransactions = true;

  while (hasMoreTransactions) {
    const response = await fetch(`${BASE_URL}/league/${leagueId}/transactions/${week}`);
    const weekTransactions: Transaction[] = await handleResponse(response);

    if (weekTransactions.length === 0) {
      hasMoreTransactions = false;
    } else {
      allTransactions = [...allTransactions, ...weekTransactions];
      week++;
    }
  }

  console.log(`Fetched total of ${allTransactions.length} transactions`);
  return allTransactions;
};

export const fetchTransactions = async (leagueId: string): Promise<Transaction[]> => {
  console.log(`Fetching transactions for league ${leagueId}`);
  const response = await fetch(`${BASE_URL}/league/${leagueId}/transactions/1`);
  const data = await handleResponse(response);
  console.log(`Fetched ${data.length} transactions`);
  return data;
};

export const fetchUsers = async (leagueId: string): Promise<Record<string, User>> => {
  console.log(`Fetching users for league ${leagueId}`);
  const response = await fetch(`${BASE_URL}/league/${leagueId}/users`);
  const data: User[] = await handleResponse(response);
  const users = data.reduce((acc, user) => {
    acc[user.user_id] = user;
    return acc;
  }, {} as Record<string, User>);
  console.log(`Fetched ${Object.keys(users).length} users`);
  return users;
};

export const fetchPlayers = async (): Promise<Record<string, Player>> => {
  console.log('Fetching players');
  const response = await fetch(`${BASE_URL}/players/nfl`);
  const data = await handleResponse(response);
  console.log(`Fetched ${Object.keys(data).length} players`);
  return data;
};

export const fetchLeague = async (leagueId: string): Promise<League> => {
  console.log(`Fetching league data for ${leagueId}`);
  const response = await fetch(`${BASE_URL}/league/${leagueId}`);
  const data = await handleResponse(response);
  console.log('Fetched league data:', data);
  return data;
};

export const fetchRosters = async (leagueId: string): Promise<Roster[]> => {
  console.log(`Fetching rosters for league ${leagueId}`);
  const response = await fetch(`${BASE_URL}/league/${leagueId}/rosters`);
  const data = await handleResponse(response);
  console.log(`Fetched ${data.length} rosters`);
  return data;
};

export const fetchDraft = async (draftId: string): Promise<any> => {
  console.log(`Fetching draft data for draft ${draftId}`);
  const response = await fetch(`${BASE_URL}/draft/${draftId}`);
  const data = await handleResponse(response);
  console.log('Fetched draft data:', data);
  return data;
};