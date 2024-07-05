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
  round: number;
  roster_id: number;
  player_id: string;
  pick_no: number;
  picked_by: string;
  draft_id: string;
}

const ConsolidatedLeagueTracker: React.FC = () => {
  const [trades, setTrades] = useState<SimplifiedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const STARTUP_SEASON = '2023';
        const ROOKIE_SEASON = '2024';

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

          const draftOrders: Record<string, Record<string, number>> = {
          '2023': draft.draft_order || {},
          '2024': draft.draft_order || {}
          };

          console.log(`Draft order for ${league.season}:`, draft.draft_order);

          // Create a map of actual picks for each roster
          const rosterPickMap: Record<number, { round: number, pick: number }[]> = {};

            if (league.season === ROOKIE_SEASON && draft.picks) {
              draft.picks.forEach((pick: any) => {
                if (!rosterPickMap[pick.roster_id]) {
                  rosterPickMap[pick.roster_id] = [];
                }
                rosterPickMap[pick.roster_id].push({ round: pick.round, pick: pick.pick_no });
              });
            }

            console.log(`Actual picks for each roster in ${league.season}:`, rosterPickMap);

          // Create user map
          const userMap: Record<string, string> = {};
          Object.values(users).forEach(user => {
            userMap[user.user_id] = user.display_name || user.user_id;
          });

          // Create roster to user map
          const rosterToUserMap: Record<number, string> = {};
          rosters.forEach(roster => {
            rosterToUserMap[roster.roster_id] = userMap[roster.owner_id] || `Unknown (Roster ${roster.roster_id})`;
          });

          // Create draft pick map
          const draftPickMap: Record<number, string> = {};
          if (draft && draft.picks) {
            draft.picks.forEach((pick: DraftPick) => {
              const playerName = players[pick.player_id]?.full_name || 'Unknown Player';
              draftPickMap[pick.pick_no] = `${pick.round}.${pick.pick_no} ${playerName}`;
            });
          }

          const processTradeData = (trade: Transaction): SimplifiedTrade => {
            const tradeDate = new Date(trade.created);
            const [team1Id, team2Id] = trade.roster_ids;

            // Update the mapDraftPick function:
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
                  return `${pick.round}.${draftSlot} (Overall ${pickNumber})`;
                } else {
                  return `${pick.season} Round ${pick.round}`;
                }
              }

              // Keep existing logic for STARTUP_SEASON
              if (currentSeason === STARTUP_SEASON) {
                let pickInRound = pick.roster_id;
                if (pick.round % 2 === 0) {
                  pickInRound = totalTeams - pick.roster_id + 1;
                }
                const pickNumber = (pick.round - 1) * totalTeams + pickInRound;
                return `${pick.round}.${pickInRound} (Overall ${pickNumber})`;
              }

              return `${pick.season} Round ${pick.round}`;
            };

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

        // Sort trades chronologically
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