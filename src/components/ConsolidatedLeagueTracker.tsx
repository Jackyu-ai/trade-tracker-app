import React, { useState, useEffect } from 'react';
import { fetchAllTransactions, fetchUsers, fetchLeague, fetchRosters, fetchDraft, fetchPlayers } from '../services/api';
import { Transaction, Roster, League, Player, DraftPick } from '../types/types';

interface SimplifiedTrade {
  transactionId: string;
  date: Date;
  season: string;
  team1: { name: string; rosterId: number };
  team2: { name: string; rosterId: number };
  team1Receives: string[];
  team2Receives: string[];
}

interface ManagerOption {
  name: string;
  rosterId: number;
}

interface ConsolidatedLeagueTrackerProps {
  initialLeagueId: string;
  is3rdRoundReversal: boolean;
}

const ConsolidatedLeagueTracker: React.FC<ConsolidatedLeagueTrackerProps> = ({ initialLeagueId, is3rdRoundReversal }) => {
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
      if (isStartupDraft) {
        if ((is3rdRoundReversal && pick.round >= 3 && pick.round % 2 !== 0) ||
            (!is3rdRoundReversal && pick.round % 2 === 0)) {
          pickInRound = totalTeams - pickInRound + 1;
        }
      }
      const pickNumber = (pick.round - 1) * totalTeams + pickInRound;
      const playerName = pickToPlayerMap.get(pickNumber) || "Undrafted";
      return `${pick.season} ${isStartupDraft ? '' : 'Rookie '}${pick.round}.${pickInRound} (Overall ${pickNumber} - ${playerName})`;
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

        for (const leagueId of leagueIds) {
          const league: League = await fetchLeague(leagueId);
          allSeasons.add(league.season);
          const users = await fetchUsers(leagueId);
          const rosters = await fetchRosters(leagueId);
          const transactions = await fetchAllTransactions(leagueId);
          const draft = await fetchDraft(league.draft_id);
          const draftPicks = await fetchDraftPicks(draft.draft_id);

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
            const [team1Id, team2Id] = trade.roster_ids;
            const isStartupDraft = leagueId === startupLeagueId;
            return {
              transactionId: trade.transaction_id,
              date: new Date(trade.created),
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
              ]
            };
          };

          allTrades = [...allTrades, ...transactions.filter(t => t.type === 'trade').map(processTradeData)];
        }

        setManagers([{ name: 'All', rosterId: -1 }, ...Array.from(allManagers, ([rosterId, name]) => ({ name, rosterId }))]);
        setSeasons(['All', ...Array.from(allSeasons)]);
        setTrades(allTrades.sort((a, b) => b.date.getTime() - a.date.getTime()));
        setLoading(false);
      } catch (err) {
        console.error('Error in fetchAllData:', err);
        setError(`Failed to fetch data. Error: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    };

    fetchAllData();
  }, [initialLeagueId, is3rdRoundReversal]);

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

    const getCondensedTrades = (trades: SimplifiedTrade[], selectedManager: number | 'All'): { acquired: string[], traded: string[] } => {
      const assets = new Map<string, number>();

      trades.forEach(trade => {
        const isTeam1 = trade.team1.rosterId === selectedManager;
        const received = isTeam1 ? trade.team1Receives : trade.team2Receives;
        const traded = isTeam1 ? trade.team2Receives : trade.team1Receives;

        received.forEach(asset => assets.set(asset, (assets.get(asset) || 0) + 1));
        traded.forEach(asset => assets.set(asset, (assets.get(asset) || 0) - 1));
      });

      let acquired: string[] = [];
      let tradedAway: string[] = [];

      assets.forEach((count, asset) => {
        if (count > 0) acquired.push(asset);
        else if (count < 0) tradedAway.push(asset);
      });

      acquired.sort((a, b) => a.localeCompare(b));
      tradedAway.sort((a, b) => a.localeCompare(b));

      // Remove players that appear in both lists
      const removeCommonPlayers = (list1: string[], list2: string[]): [string[], string[]] => {
          const toRemove = new Set<string>();

          list1.forEach(item1 => {
            const playerName = item1.split(' ').slice(0, 2).join(' ');
            if (list2.some(item2 => item2.includes(playerName))) {
              toRemove.add(playerName);
            }
          });

          const removeArray = Array.from(toRemove);
          return [
            list1.filter(item => !removeArray.some(name => item.includes(name))),
            list2.filter(item => !removeArray.some(name => item.includes(name)))
          ];
        };

      [acquired, tradedAway] = removeCommonPlayers(acquired, tradedAway);

      return { acquired, traded: tradedAway };
    };

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
      ) : isCondensed && selectedManager !== 'All' ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="border p-4 rounded shadow">
              <h2 className="text-xl font-bold mb-2">Net Acquired</h2>
              <ul className="list-disc pl-5">
                {getCondensedTrades(filteredTrades, selectedManager).acquired.map((asset, i) => (
                  <li key={i}>{asset}</li>
                ))}
              </ul>
            </div>
            <div className="border p-4 rounded shadow">
              <h2 className="text-xl font-bold mb-2">Net Traded Away</h2>
              <ul className="list-disc pl-5">
                {getCondensedTrades(filteredTrades, selectedManager).traded.map((asset, i) => (
                  <li key={i}>{asset}</li>
                ))}
              </ul>
            </div>
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
                <td className="border px-4 py-2">{trade.date.toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
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