import React, { useState, useEffect } from 'react';
import { fetchAllTransactions, fetchUsers, fetchLeague, fetchRosters, fetchDraft, fetchPlayers } from '../services/api';
import { Transaction, User, Roster, League, DraftPick, Player } from '../types/types';

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

interface DraftPickMap {
  [key: string]: string; // "2023-1-1" -> "Player Name"
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

    const draftIds = [
      '1064776225371099137', // 2024 Draft ID
      '993596402045345792',  // 2023 Draft ID
    ];

    const fetchAllData = async () => {
      try {
        setLoading(true);
        setError(null);

        const players: Record<string, Player> = await fetchPlayers();
        console.log(`Fetched ${Object.keys(players).length} players`);

        let allTrades: SimplifiedTrade[] = [];

        const draftPickMap: DraftPickMap = {};

        for (let i = 0; i < leagueIds.length; i++) {
          const id = leagueIds[i];
          const draftId = draftIds[i];

          console.log(`Fetching data for league ${id} and draft ${draftId}`);

          const league: League = await fetchLeague(id);
          console.log('League data:', league);

          const transactions: Transaction[] = await fetchAllTransactions(id);
          console.log(`Fetched ${transactions.length} transactions for league ${id}`);

          const users: Record<string, User> = await fetchUsers(id);
          console.log(`Fetched ${Object.keys(users).length} users`);

          const rosters: Roster[] = await fetchRosters(id);
          console.log(`Fetched ${rosters.length} rosters`);

          const draft: any = await fetchDraft(draftId);
          console.log('Draft data:', draft);

          const managerMap = rosters.reduce((acc, roster) => {
            acc[roster.roster_id] = users[roster.owner_id]?.display_name || 'Unknown';
            return acc;
          }, {} as Record<number, string>);

           const processTradeData = (trade: any, isDraftTrade: boolean, source: string): SimplifiedTrade => {
              const [team1Id, team2Id] = trade.roster_ids;
              const tradeDate = new Date(trade.created);

              if (tradeDate.getFullYear() > 3000) {
                tradeDate.setFullYear(parseInt(league.season));
              }

              return {
                transactionId: trade.transaction_id || `draft-${trade.id}`,
                date: tradeDate,
                season: league.season,
                team1: managerMap[team1Id],
                team2: managerMap[team2Id],
                team1Receives: [
                  ...Object.keys(trade.adds || {})
                    .filter(playerId => trade.adds[playerId] === team1Id)
                    .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                  ...trade.draft_picks
                    .filter((pick: DraftPick) => pick.owner_id === team1Id)
                    .map((pick: DraftPick) => `${pick.season} Round ${pick.round} Pick`)
                ],
                team2Receives: [
                  ...Object.keys(trade.adds || {})
                    .filter(playerId => trade.adds[playerId] === team2Id)
                    .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                  ...trade.draft_picks
                    .filter((pick: DraftPick) => pick.owner_id === team2Id)
                    .map((pick: DraftPick) => `${pick.season} Round ${pick.round} Pick`)
                ],
                isDraftTrade,
                source
              };
            };

          const leagueTrades = transactions
            .filter(transaction => transaction.type === 'trade')
            .map(trade => processTradeData(trade, false, `League Transactions (${league.season})`));
          console.log(`Processed ${leagueTrades.length} league trades`);

          const draftTrades = (draft.trades || []).map((trade: any) => processTradeData(trade, true, `Draft Trades (${league.season})`));
          console.log(`Processed ${draftTrades.length} draft trades`);

          allTrades = [...allTrades, ...leagueTrades, ...draftTrades];
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
                <td className="border px-4 py-2">{trade.date.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</td>
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