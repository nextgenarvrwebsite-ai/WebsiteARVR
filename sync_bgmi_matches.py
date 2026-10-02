import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. Login as Admin
login_data = json.dumps({'email': 'admin@nextgenarvr.club', 'password': 'Admin@NextGen2026!'}).encode('utf-8')
req = urllib.request.Request('http://localhost:5000/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
res = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
token = res['token']
print('Admin authenticated successfully.')

# 2. Check existing matches for Tournament 3
req = urllib.request.Request('http://localhost:5000/api/esports/tournaments/3/leaderboard')
t3_data = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
existing_matches = t3_data.get('matches', [])
print(f'Existing matches for Tournament 3: {len(existing_matches)}')

if len(existing_matches) == 0:
    # Match 1: Erangel Launch
    m1_results = [
        {'team_id': 213, 'placement': 1, 'kills': 12}, # Soul Esports
        {'team_id': 214, 'placement': 2, 'kills': 9},  # GodLike
        {'team_id': 215, 'placement': 3, 'kills': 7},  # Team XSpark
        {'team_id': 216, 'placement': 4, 'kills': 6},  # Entity Gaming
        {'team_id': 217, 'placement': 5, 'kills': 5},  # Blind
        {'team_id': 218, 'placement': 6, 'kills': 4},  # Revenant
        {'team_id': 219, 'placement': 7, 'kills': 3},  # Orangutan
        {'team_id': 220, 'placement': 8, 'kills': 2},  # Gladiators
        {'team_id': 221, 'placement': 9, 'kills': 1},
        {'team_id': 222, 'placement': 10, 'kills': 1},
        {'team_id': 223, 'placement': 11, 'kills': 0},
        {'team_id': 224, 'placement': 12, 'kills': 0},
        {'team_id': 225, 'placement': 13, 'kills': 0},
        {'team_id': 226, 'placement': 14, 'kills': 0},
        {'team_id': 227, 'placement': 15, 'kills': 0},
        {'team_id': 228, 'placement': 16, 'kills': 0}
    ]
    m1_data = json.dumps({
        'tournament_id': 3,
        'match_number': 1,
        'match_title': 'Match 1 · Erangel Launch',
        'map_name': 'Erangel',
        'mvp_player': 'SOUL_Manya (7 Kills)',
        'results': m1_results
    }).encode('utf-8')
    req = urllib.request.Request('http://localhost:5000/api/esports/matches', data=m1_data, headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
    urllib.request.urlopen(req)
    print('Match 1 recorded successfully.')

    # Match 2: Miramar Ridge Storm
    m2_results = [
        {'team_id': 214, 'placement': 1, 'kills': 14}, # GodLike
        {'team_id': 213, 'placement': 2, 'kills': 8},  # Soul
        {'team_id': 216, 'placement': 3, 'kills': 7},  # Entity
        {'team_id': 215, 'placement': 4, 'kills': 6},  # Team XSpark
        {'team_id': 218, 'placement': 5, 'kills': 5},  # Revenant
        {'team_id': 217, 'placement': 6, 'kills': 4},  # Blind
        {'team_id': 220, 'placement': 7, 'kills': 3},  # Gladiators
        {'team_id': 219, 'placement': 8, 'kills': 2},  # Orangutan
        {'team_id': 222, 'placement': 9, 'kills': 2},
        {'team_id': 221, 'placement': 10, 'kills': 1},
        {'team_id': 223, 'placement': 11, 'kills': 1},
        {'team_id': 224, 'placement': 12, 'kills': 0},
        {'team_id': 225, 'placement': 13, 'kills': 0},
        {'team_id': 226, 'placement': 14, 'kills': 0},
        {'team_id': 227, 'placement': 15, 'kills': 0},
        {'team_id': 228, 'placement': 16, 'kills': 0}
    ]
    m2_data = json.dumps({
        'tournament_id': 3,
        'match_number': 2,
        'match_title': 'Match 2 · Miramar Ridge Storm',
        'map_name': 'Miramar',
        'mvp_player': 'GODL_Jonathan (9 Kills)',
        'results': m2_results
    }).encode('utf-8')
    req = urllib.request.Request('http://localhost:5000/api/esports/matches', data=m2_data, headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
    urllib.request.urlopen(req)
    print('Match 2 recorded successfully.')

# Verify recalculated standings
req = urllib.request.Request('http://localhost:5000/api/esports/tournaments/3/leaderboard')
updated = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
print('\nUpdated BGMI Standings (Top 5):')
for t in updated['leaderboard'][:5]:
    print(f"#{t['rank']} {t['team_name']} ({t['tag']}): Total={t['total_points']}, Wins={t['wins']}, Kills={t['kills']}, PlacementPts={t['placement_points']}")
