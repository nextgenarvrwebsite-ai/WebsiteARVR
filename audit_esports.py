import urllib.request
import json
import sys

# Set stdout encoding to utf-8
sys.stdout.reconfigure(encoding='utf-8')

def get(path):
    url = f'http://localhost:5000{path}'
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read().decode('utf-8'))

overview = get('/api/esports/overview')
print('=== OVERVIEW TOURNAMENTS ===')
for t in overview['tournaments']:
    print(f"ID: {t['id']} | Title: {t['title']} | Game: {t.get('game_name')} | Teams: {t.get('team_count')}")

for t in overview['tournaments']:
    tid = t['id']
    data = get(f'/api/esports/tournaments/{tid}/leaderboard')
    tourn = data['tournament']
    rules = tourn.get('scoring_rules', {})
    teams = data['leaderboard']
    matches = data['matches']
    warhead = data['warhead']
    print(f"\n=== TOURNAMENT {tid}: {tourn['title']} ===")
    print(f"Game: {tourn.get('game_name')} | Prize: {tourn.get('prize_pool')}")
    print(f"Scoring System: {rules.get('system_name')} | Win Title: {rules.get('win_title')} | Kill Mult: {rules.get('kill_multiplier')}")
    scale = rules.get('placement_scale', {})
    print(f"Scale sample (1-4): {[(k, scale.get(str(k)) or scale.get(k)) for k in range(1, 5)]}")
    print(f"Total Teams: {len(teams)} | Total Matches: {len(matches)} | Warhead rows: {len(warhead)}")
    print("Top 3 Teams:")
    for team in teams[:3]:
        print(f"  #{team.get('rank')} {team.get('team_name')} ({team.get('tag')}): Total={team.get('total_points')}, Wins={team.get('wins')}, Kills={team.get('kills')}, PlacementPts={team.get('placement_points')}")
