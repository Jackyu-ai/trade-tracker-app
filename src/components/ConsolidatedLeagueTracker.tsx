import React, { useState, useEffect } from 'react';
import { fetchAllTransactions, fetchUsers, fetchLeague, fetchRosters, fetchDraft, fetchPlayers } from '../services/api';
import { Transaction, Roster, League, Player } from '../types/types';

interface User {
  user_id: string;
  display_name: string;
  metadata: {
    team_name?: string;
  };
  avatar?: string;
}

interface SimplifiedTrade {
  transactionId: string;
  date: Date;
  season: string;
  team1: string;
  team2: string;
  team1Receives: string[];
  team2Receives: string[];
  isDraftTrade: boolean;
  source: string;
}

interface DraftPick {
  player_id: string;
  picked_by: string;
  roster_id: string;
  round: number;
  draft_slot: number;
  pick_no: number;
  metadata: {
    team: string;
    status: string;
    sport: string;
    position: string;
    player_id: string;
    number: string;
    news_updated: string;
    last_name: string;
    injury_status: string;
    first_name: string;
  };
  is_keeper: null | boolean;
  draft_id: string;
}

const STARTUP_SEASON = '2023';
const ROOKIE_SEASON = '2024';

const ConsolidatedLeagueTracker: React.FC = () => {
  const [trades, setTrades] = useState<SimplifiedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDraftPicks = async (draftId: string): Promise<DraftPick[]> => {
    const response = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  };

  useEffect(() => {
    const leagueIds = [
      '1064776225371099136', // 2024 League ID
      '993596401017802752',  // 2023 League ID
    ];

    const fetchAllData = async () => {
      try {
        setLoading(true);
        setError(null);

        const players: Record<string, Player> = await fetchPlayers();
        console.log(`Fetched ${Object.keys(players).length} players`);

        let allTrades: SimplifiedTrade[] = [];

        for (const leagueId of leagueIds) {
          console.log(`Fetching data for league ${leagueId}`);

          const league: League = await fetchLeague(leagueId);
          console.log('League data:', league);

          const users: Record<string, User> = await fetchUsers(leagueId);
          console.log(`Fetched ${Object.keys(users).length} users`);

          const rosters: Roster[] = await fetchRosters(leagueId);
          console.log(`Fetched ${rosters.length} rosters`);

          const transactions: Transaction[] = await fetchAllTransactions(leagueId);
          console.log(`Fetched ${transactions.length} transactions`);

          const draft: any = await fetchDraft(league.draft_id);
          console.log('Draft data:', draft);

          const draftPicks: DraftPick[] = await fetchDraftPicks(draft.draft_id);
          console.log(`Fetched ${draftPicks.length} draft picks`);

          const pickToPlayerMap = new Map(draftPicks.map(pick => [
            pick.pick_no,
            `${pick.metadata.first_name} ${pick.metadata.last_name}`
          ]));

          const userMap: Record<string, string> = {};
          Object.values(users).forEach(user => {
            userMap[user.user_id] = user.display_name || user.user_id;
          });

          const rosterToUserMap: Record<number, string> = {};
          rosters.forEach(roster => {
            rosterToUserMap[roster.roster_id] = userMap[roster.owner_id] || `Unknown (Roster ${roster.roster_id})`;
          });

          const mapDraftPick = (pick: {
            season: string;
            round: number;
            roster_id: number;
            owner_id: number;
            previous_owner_id: number;
          }) => {
            const totalTeams = rosters.length;
            const currentSeason = league.season;

            if (pick.season > currentSeason) {
              return `${pick.season} Round ${pick.round}`;
            }

            if (currentSeason === ROOKIE_SEASON) {
              const slotToRosterId = draft.slot_to_roster_id || {};
              const draftSlot = Object.keys(slotToRosterId).find(slot => slotToRosterId[slot] === pick.roster_id);

              if (draftSlot) {
                const pickNumber = (pick.round - 1) * totalTeams + parseInt(draftSlot);
                const playerName = pickToPlayerMap.get(pickNumber) || "Undrafted";
                return `${pick.round}.${draftSlot} (Overall ${pickNumber} - ${playerName})`;
              } else {
                return `${pick.season} Round ${pick.round}`;
              }
            }

            if (currentSeason === STARTUP_SEASON) {
              let pickInRound = pick.roster_id;
              if (pick.round % 2 === 0) {
                pickInRound = totalTeams - pick.roster_id + 1;
              }
              const pickNumber = (pick.round - 1) * totalTeams + pickInRound;
              const playerName = pickToPlayerMap.get(pickNumber) || "Undrafted";
              return `${pick.round}.${pickInRound} (Overall ${pickNumber} - ${playerName})`;
            }

            return `${pick.season} Round ${pick.round}`;
          };

          const processTradeData = (trade: Transaction): SimplifiedTrade => {
            const tradeDate = new Date(trade.created);
            const [team1Id, team2Id] = trade.roster_ids;

            return {
              transactionId: trade.transaction_id,
              date: tradeDate,
              season: league.season,
              team1: rosterToUserMap[team1Id],
              team2: rosterToUserMap[team2Id],
              team1Receives: [
                ...Object.keys(trade.adds || {})
                  .filter(playerId => trade.adds && trade.adds[playerId] === team1Id)
                  .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                ...(trade.draft_picks || [])
                  .filter(pick => pick.owner_id === team1Id)
                  .map(mapDraftPick)
              ],
              team2Receives: [
                ...Object.keys(trade.adds || {})
                  .filter(playerId => trade.adds && trade.adds[playerId] === team2Id)
                  .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                ...(trade.draft_picks || [])
                  .filter(pick => pick.owner_id === team2Id)
                  .map(mapDraftPick)
              ],
              isDraftTrade: false,
              source: `League Transactions (${league.season})`
            };
          };

          const leagueTrades = transactions
            .filter(transaction => transaction.type === 'trade')
            .map(processTradeData);

          allTrades = [...allTrades, ...leagueTrades];
        }

        allTrades.sort((a, b) => a.date.getTime() - b.date.getTime());
        console.log('Total trades:', allTrades.length);
        setTrades(allTrades);
        setLoading(false);
      } catch (err) {
        console.error('Error in fetchAllData:', err);
        setError(`Failed to fetch data. Error: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  if (loading) return <div>Loading league data...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-6">Trade Tracker</h1>
      {trades.length === 0 ? (
        <div>No trades found. Please check the console for more information.</div>
      ) : (
        <table className="min-w-full bg-white">
          <thead className="bg-gray-200">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Season</th>
              <th className="px-4 py-2 text-left">Team 1</th>
              <th className="px-4 py-2 text-left">Team 1 Receives</th>
              <th className="px-4 py-2 text-left">Team 2</th>
              <th className="px-4 py-2 text-left">Team 2 Receives</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.transactionId} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{trade.date.toLocaleString()}</td>
                <td className="border px-4 py-2">{trade.season}</td>
                <td className="border px-4 py-2">{trade.team1}</td>
                <td className="border px-4 py-2">{trade.team1Receives.join(', ') || 'None'}</td>
                <td className="border px-4 py-2">{trade.team2}</td>
                <td className="border px-4 py-2">{trade.team2Receives.join(', ') || 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ConsolidatedLeagueTracker;