import requests
from datetime import datetime

DRAFT_ID = "993596402045345792"

def get_league_id(draft_id):
    url = f"https://api.sleeper.app/v1/draft/{draft_id}"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()['league_id']
    else:
        raise Exception(f"Failed to fetch draft info. Status code: {response.status_code}")

def get_league_users(league_id):
    url = f"https://api.sleeper.app/v1/league/{league_id}/users"
    response = requests.get(url)
    if response.status_code == 200:
        return {user['user_id']: user['display_name'] for user in response.json()}
    else:
        raise Exception(f"Failed to fetch league users. Status code: {response.status_code}")

def get_league_rosters(league_id):
    url = f"https://api.sleeper.app/v1/league/{league_id}/rosters"
    response = requests.get(url)
    if response.status_code == 200:
        return {roster['roster_id']: roster['owner_id'] for roster in response.json()}
    else:
        raise Exception(f"Failed to fetch league rosters. Status code: {response.status_code}")

def get_transactions(league_id):
    url = f"https://api.sleeper.app/v1/league/{league_id}/transactions/1"  # Assuming week 1 for draft trades
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to fetch transactions. Status code: {response.status_code}")

def get_draft_picks(draft_id):
    url = f"https://api.sleeper.app/v1/draft/{draft_id}/picks"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to fetch draft picks. Status code: {response.status_code}")

def get_players():
    url = "https://api.sleeper.app/v1/players/nfl"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to fetch players. Status code: {response.status_code}")

def find_first_trade(transactions):
    trades = [t for t in transactions if t['type'] == 'trade']
    return min(trades, key=lambda x: x['created']) if trades else None

def analyze_trade(trade, users, rosters, draft_picks, players):
    print("Raw Transaction:")
    print(trade)
    print("\nTeams involved in this transaction:")
    teams = [users.get(rosters.get(roster_id), f"Unknown Manager (Roster ID: {roster_id})") for roster_id in trade['roster_ids']]
    print(", ".join(teams))

    draft_pick_map = {f"{pick['round']}.{pick['draft_slot']}": pick for pick in draft_picks}

    print("\nAnalysis:")
    for roster_id in trade['roster_ids']:
        manager = users.get(rosters.get(roster_id), f"Unknown Manager (Roster ID: {roster_id})")
        picks = [pick for pick in trade['draft_picks'] if pick['owner_id'] == roster_id]
        for pick in picks:
            pick_string = f"{pick['round']}.{pick['roster_id']}"
            pick_details = draft_pick_map.get(pick_string, {})
            player_name = "Unknown Player"
            if 'player_id' in pick_details:
                player = players.get(pick_details['player_id'], {})
                player_name = f"{player.get('first_name', '')} {player.get('last_name', '')}".strip()
            print(f"{manager} acquired Pick {pick_string}, "
                  f"which turned into pick number {pick_details.get('pick_no', 'Unknown')} "
                  f"({player_name})")

# Main execution
league_id = get_league_id(DRAFT_ID)
users = get_league_users(league_id)
rosters = get_league_rosters(league_id)
transactions = get_transactions(league_id)
draft_picks = get_draft_picks(DRAFT_ID)
players = get_players()

first_trade = find_first_trade(transactions)

if first_trade:
    analyze_trade(first_trade, users, rosters, draft_picks, players)
else:
    print("No trades found in this draft.")