import React, { useState, useEffect } from 'react';
import { fetchAllTransactions, fetchUsers, fetchLeague, fetchRosters, fetchDraft, fetchPlayers } from '../services/api';
import { Transaction, Roster, League, Player, DraftPick } from '../types/types';

interface User {
  user_id: string;
  display_name: string;
  metadata: { team_name?: string; };
  avatar?: string;
  username: string;
}

interface SimplifiedTrade {
  transactionId: string;
  date: Date;
  season: string;
  team1: { name: string; rosterId: number };
  team2: { name: string; rosterId: number };
  team1Receives: string[];
  team2Receives: string[];
  isDraftTrade: boolean;
  source: string;
}

interface ManagerOption {
  name: string;
  rosterId: number;
}

interface CondensedTrade {
  manager: string;
  received: string[];
  traded: string[];
}


const ConsolidatedLeagueTracker: React.FC<{ initialLeagueId: string }> = ({ initialLeagueId }) => {
  const [trades, setTrades] = useState<SimplifiedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [selectedManager, setSelectedManager] = useState<number | 'All'>('All');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('All');
  const [isCondensed, setIsCondensed] = useState(false);

  const fetchDraftPicks = async (draftId: string): Promise<DraftPick[]> => {
    const response = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  };

  const mapDraftPick = (
      pick: DraftPick,
      currentSeason: string,
      draft: any,
      rosters: Roster[],
      pickToPlayerMap: Map<number, string>,
      isStartupDraft: boolean
    ): string => {
      const totalTeams = rosters.length;
      if (pick.season > currentSeason) return `${pick.season} ${isStartupDraft ? '' : 'Rookie '}Round ${pick.round}`;
      const slotToRosterId = draft.slot_to_roster_id || {};
      const draftSlot = Object.keys(slotToRosterId).find(slot => slotToRosterId[slot] === pick.roster_id);
      if (draftSlot) {
        let pickInRound = parseInt(draftSlot);
        if (isStartupDraft && pick.round % 2 === 0) {
          pickInRound = totalTeams - pickInRound + 1;
        }
        const pickNumber = (pick.round - 1) * totalTeams + pickInRound;
        const playerName = pickToPlayerMap.get(pickNumber) || "Undrafted";
        const pickString = `${pick.season} ${isStartupDraft ? '' : 'Rookie '}${pick.round}.${pickInRound}`;
        return `${pickString} (Overall ${pickNumber} - ${playerName})`;
      }
      return `${pick.season} ${isStartupDraft ? '' : 'Rookie '}Round ${pick.round}`;
    };

  useEffect(() => {
      const fetchAllData = async () => {
        try {
          setLoading(true);
          setError(null);
          const players: Record<string, Player> = await fetchPlayers();
          let allTrades: SimplifiedTrade[] = [];
          let allManagers = new Map<number, string>();
          let allSeasons = new Set<string>();
          const leagueIds = await fetchLeagueHistory(initialLeagueId);
          const startupLeagueId = leagueIds[0];


          for (let i = 0; i < leagueIds.length; i++) {
            const leagueId = leagueIds[i];
            const league: League = await fetchLeague(leagueId);
            allSeasons.add(league.season);
            const users: Record<string, User> = await fetchUsers(leagueId);
            const rosters: Roster[] = await fetchRosters(leagueId);
            const transactions: Transaction[] = await fetchAllTransactions(leagueId);
            const draft: any = await fetchDraft(league.draft_id);
            const draftPicks: DraftPick[] = await fetchDraftPicks(draft.draft_id);

            const pickToPlayerMap = new Map(draftPicks.map(pick => [
              pick.pick_no,
              players[pick.player_id]?.full_name || "Unknown Player"
            ]));

            const rosterToUserMap: Record<number, string> = {};
            rosters.forEach(roster => {
              const user = users[roster.owner_id];
              const managerName = user ? (user.display_name || user.username) : `Unknown (Roster ${roster.roster_id})`;
              rosterToUserMap[roster.roster_id] = managerName;
              allManagers.set(roster.roster_id, managerName);
            });

            const processTradeData = (trade: Transaction): SimplifiedTrade => {
              const tradeDate = new Date(trade.created);
              const [team1Id, team2Id] = trade.roster_ids;
              const isStartupDraft = leagueId === startupLeagueId;
              return {
                transactionId: trade.transaction_id,
                date: tradeDate,
                season: league.season,
                team1: { name: rosterToUserMap[team1Id], rosterId: team1Id },
                team2: { name: rosterToUserMap[team2Id], rosterId: team2Id },
                team1Receives: [
                  ...Object.keys(trade.adds || {})
                    .filter(playerId => trade.adds && trade.adds[playerId] === team1Id)
                    .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                  ...(trade.draft_picks || [])
                    .filter(pick => pick.owner_id === team1Id)
                    .map(pick => mapDraftPick(pick, league.season, draft, rosters, pickToPlayerMap, isStartupDraft))
                ],
                team2Receives: [
                  ...Object.keys(trade.adds || {})
                    .filter(playerId => trade.adds && trade.adds[playerId] === team2Id)
                    .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                  ...(trade.draft_picks || [])
                    .filter(pick => pick.owner_id === team2Id)
                    .map(pick => mapDraftPick(pick, league.season, draft, rosters, pickToPlayerMap, isStartupDraft))
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

          setManagers([{ name: 'All', rosterId: -1 }, ...Array.from(allManagers, ([rosterId, name]) => ({ name, rosterId }))]);
          setSeasons(['All', ...Array.from(allSeasons)]);
          allTrades.sort((a, b) => b.date.getTime() - a.date.getTime());
          setTrades(allTrades);
          setLoading(false);
        } catch (err) {
          console.error('Error in fetchAllData:', err);
          setError(`Failed to fetch data. Error: ${err instanceof Error ? err.message : String(err)}`);
          setLoading(false);
        }
      };

      fetchAllData();
    }, [initialLeagueId]);

  const fetchLeagueHistory = async (leagueId: string): Promise<string[]> => {
      const leagueIds = [leagueId];
      let currentLeagueId = leagueId;
      while (true) {
        const currentLeague: League = await fetchLeague(currentLeagueId);
        if (currentLeague.previous_league_id) {
          leagueIds.unshift(currentLeague.previous_league_id);
          currentLeagueId = currentLeague.previous_league_id;
        } else {
          break;
        }
      }
      return leagueIds;
    };

  const getCondensedTrades = (trades: SimplifiedTrade[]): CondensedTrade[] => {
    const managerAssets: Record<number, { received: Set<string>; traded: Set<string> }> = {};

    trades.forEach(trade => {
      if (!managerAssets[trade.team1.rosterId]) {
        managerAssets[trade.team1.rosterId] = { received: new Set(), traded: new Set() };
      }
      if (!managerAssets[trade.team2.rosterId]) {
        managerAssets[trade.team2.rosterId] = { received: new Set(), traded: new Set() };
      }

      trade.team1Receives.forEach(asset => {
        if (managerAssets[trade.team1.rosterId].traded.has(asset)) {
          managerAssets[trade.team1.rosterId].traded.delete(asset);
        } else {
          managerAssets[trade.team1.rosterId].received.add(asset);
        }
        managerAssets[trade.team2.rosterId].traded.add(asset);
      });

      trade.team2Receives.forEach(asset => {
        if (managerAssets[trade.team2.rosterId].traded.has(asset)) {
          managerAssets[trade.team2.rosterId].traded.delete(asset);
        } else {
          managerAssets[trade.team2.rosterId].received.add(asset);
        }
        managerAssets[trade.team1.rosterId].traded.add(asset);
      });
    });

    return Object.entries(managerAssets).map(([rosterId, assets]) => ({
      manager: managers.find(m => m.rosterId === parseInt(rosterId))?.name || 'Unknown',
      received: Array.from(assets.received),
      traded: Array.from(assets.traded)
    }));
  };

  const filteredTrades = trades
    .filter(trade =>
      (selectedManager === 'All' || trade.team1.rosterId === selectedManager || trade.team2.rosterId === selectedManager) &&
      (selectedSeason === 'All' || trade.season === selectedSeason)
    )
    .map(trade => {
      if (selectedManager !== 'All' && trade.team2.rosterId === selectedManager) {
        return {
          ...trade,
          team1: trade.team2,
          team2: trade.team1,
          team1Receives: trade.team2Receives,
          team2Receives: trade.team1Receives
        };
      }
      return trade;
    });

  const condensedTrades = getCondensedTrades(filteredTrades);

  if (loading) return <div>Loading league data...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-6">Trade Tracker</h1>
      <div className="mb-4 flex space-x-4">
        <div>
          <label htmlFor="managerFilter" className="mr-2">Filter by Manager:</label>
          <select
            id="managerFilter"
            value={selectedManager}
            onChange={(e) => setSelectedManager(e.target.value === 'All' ? 'All' : Number(e.target.value))}
            className="border rounded p-2"
          >
            <option value="All">All Managers</option>
            {managers.filter(manager => manager.rosterId !== -1).map(manager => (
              <option key={manager.rosterId} value={manager.rosterId}>{manager.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="seasonFilter" className="mr-2">Filter by Season:</label>
          <select
            id="seasonFilter"
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="border rounded p-2"
          >
            {seasons.map(season => (
              <option key={season} value={season}>{season}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="condensedView" className="mr-2">
            <input
              type="checkbox"
              id="condensedView"
              checked={isCondensed}
              onChange={(e) => setIsCondensed(e.target.checked)}
              className="mr-1"
            />
            Condensed View
          </label>
        </div>
      </div>
      {filteredTrades.length === 0 ? (
        <div>No trades found. Please check the console for more information.</div>
      ) : isCondensed ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {condensedTrades.map((trade, index) => (
            <div key={index} className="border p-4 rounded shadow">
              <h2 className="text-xl font-bold mb-2">{trade.manager}</h2>
              <div className="mb-2">
                <h3 className="font-semibold text-green-600">Received:</h3>
                <ul className="list-disc pl-5">
                  {trade.received.map((asset, i) => (
                    <li key={i}>{asset}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-red-600">Traded:</h3>
                <ul className="list-disc pl-5">
                  {trade.traded.map((asset, i) => (
                    <li key={i}>{asset}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
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
            {filteredTrades.map((trade) => (
              <tr key={trade.transactionId} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{trade.date.toLocaleString()}</td>
                <td className="border px-4 py-2">{trade.season}</td>
                <td className="border px-4 py-2">{trade.team1.name}</td>
                <td className="border px-4 py-2">
                  <ul className="list-disc pl-5">
                    {trade.team1Receives.map((asset, index) => (
                      <li key={index}>{asset}</li>
                    ))}
                  </ul>
                </td>
                <td className="border px-4 py-2">{trade.team2.name}</td>
                <td className="border px-4 py-2">
                  <ul className="list-disc pl-5">
                    {trade.team2Receives.map((asset, index) => (
                      <li key={index}>{asset}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    );
  };

export default ConsolidatedLeagueTracker;