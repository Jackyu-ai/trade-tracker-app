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

interface ManagerOption {
  name: string;
  rosterId: number;
}

const STARTUP_SEASON = '2023';
const ROOKIE_SEASON = '2024';

const ConsolidatedLeagueTracker: React.FC<{ initialLeagueId: string }> = ({ initialLeagueId }) => {
  const [trades, setTrades] = useState<SimplifiedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [selectedManager, setSelectedManager] = useState<number | 'All'>('All');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('All');

  const fetchDraftPicks = async (draftId: string): Promise<DraftPick[]> => {
    const response = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  };

  const mapDraftPick = (pick: {
    season: string;
    round: number;
    roster_id: number;
    owner_id: number;
    previous_owner_id: number;
  }, currentSeason: string, draft: any, rosters: Roster[], pickToPlayerMap: Map<number, string>): string => {
    const totalTeams = rosters.length;

    if (pick.season > currentSeason) {
      return `${pick.season} Round ${pick.round}`;
    }

    const slotToRosterId = draft.slot_to_roster_id || {};
    const draftSlot = Object.keys(slotToRosterId).find(slot => slotToRosterId[slot] === pick.roster_id);

    if (draftSlot) {
      let pickInRound = parseInt(draftSlot);
      if (currentSeason === STARTUP_SEASON && pick.round % 2 === 0) {
        pickInRound = totalTeams - pickInRound + 1;
      }
      const pickNumber = (pick.round - 1) * totalTeams + pickInRound;
      const playerName = pickToPlayerMap.get(pickNumber) || "Undrafted";
      return `${pick.round}.${pickInRound} (Overall ${pickNumber} - ${playerName})`;
    } else {
      return `${pick.season} Round ${pick.round}`;
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        setError(null);

        const players: Record<string, Player> = await fetchPlayers();
        console.log(`Fetched ${Object.keys(players).length} players`);

        let allTrades: SimplifiedTrade[] = [];
        let allManagers = new Map<number, string>();
        let allSeasons = new Set<string>();

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

        const leagueIds = await fetchLeagueHistory(initialLeagueId);
        console.log('League history:', leagueIds);

        for (const leagueId of leagueIds) {
          const league: League = await fetchLeague(leagueId);
          console.log('League data:', league);

          allSeasons.add(league.season);

          const users: Record<string, User> = await fetchUsers(leagueId);
          const rosters: Roster[] = await fetchRosters(leagueId);
          const transactions: Transaction[] = await fetchAllTransactions(leagueId);
          const draft: any = await fetchDraft(league.draft_id);
          const draftPicks: DraftPick[] = await fetchDraftPicks(draft.draft_id);

          const pickToPlayerMap = new Map(draftPicks.map(pick => [
            pick.pick_no,
            `${pick.metadata.first_name} ${pick.metadata.last_name}`
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
                  .map(pick => mapDraftPick(pick, league.season, draft, rosters, pickToPlayerMap))
              ],
              team2Receives: [
                ...Object.keys(trade.adds || {})
                  .filter(playerId => trade.adds && trade.adds[playerId] === team2Id)
                  .map(playerId => players[playerId]?.full_name || `Unknown Player (${playerId})`),
                ...(trade.draft_picks || [])
                  .filter(pick => pick.owner_id === team2Id)
                  .map(pick => mapDraftPick(pick, league.season, draft, rosters, pickToPlayerMap))
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

  const filteredTrades = trades.filter(trade =>
    (selectedManager === 'All' || trade.team1.rosterId === selectedManager || trade.team2.rosterId === selectedManager) &&
    (selectedSeason === 'All' || trade.season === selectedSeason)
  );

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
            {managers.map(manager => (
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
      </div>
      {filteredTrades.length === 0 ? (
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
            {filteredTrades.map((trade) => (
              <tr key={trade.transactionId} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{trade.date.toLocaleString()}</td>
                <td className="border px-4 py-2">{trade.season}</td>
                <td className="border px-4 py-2">{trade.team1.name}</td>
                <td className="border px-4 py-2">{trade.team1Receives.join(', ') || 'None'}</td>
                <td className="border px-4 py-2">{trade.team2.name}</td>
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