# KSCU Sports page — working files

The live page is `content/sports/` (a Hugo page bundle served at `/sports/`):

| File | What it is |
|---|---|
| `content/sports/index.html` | The page. **Generated** — edit `prototypes/sports.html`, then rebuild. |
| `content/sports/scu-schedule.json` | Every Bronco game, from Santa Clara Athletics' public calendar. |
| `content/sports/restroom-*.png` | Men's / women's markers (public-domain AIGA/US DOT pictograms). |

Files in this folder:

| File | What it does |
|---|---|
| `sports.html` | Standalone version of the page — open it with any local web server to design/test. |
| `build_page.py` | Turns `sports.html` into `content/sports/index.html`, scoping all CSS/JS under `#kscu-sports` so it can't affect the rest of the site. |
| `build_snapshot.py` | Refreshes the schedule data from SCU Athletics. |
| `build_rosters.py` | Refreshes the team rosters (players, coaches, photo links) from SCU Athletics. |

## Common tasks (run from the repo root)

Refresh the schedule (new games, times, results for non-ESPN sports):

```bash
python3 prototypes/build_snapshot.py content/sports/scu-schedule.json
```

Refresh the rosters (the GitHub Action does this on March 1 and September 1):

```bash
python3 prototypes/build_rosters.py content/sports/rosters.json
```

Rebuild the page after editing `prototypes/sports.html`:

```bash
python3 prototypes/build_page.py
```

## What updates by itself (no rebuild needed)

Fetched live in the visitor's browser, free and with no API keys:
- **ESPN** — men's & women's basketball, women's volleyball, men's & women's soccer: live scores, box scores,
  logos, records, WCC standings, TV info, final scores, headlines.
- **Mixlr** — whether KSCU Sports is broadcasting right now.

Other sports (water polo, tennis, golf, XC/track) get results when `scu-schedule.json` is refreshed (hourly, by the GitHub Action).
The refresh also reads each sport's schedule page on santaclarabroncos.com for opponent logos and links to each game's
box score (or results PDF) and recap, and reads each new box score page once for the score by period and team stats.
Those show on the game page you get by clicking a final score (`#/game/<SCU game id>`).

Rosters come from each team's roster page and only change at the start of a season, so they refresh twice a year.
Player photos aren't stored in the repo; the page loads them from SCU's image server.

## Not done yet (needs changes outside the sports page)

- A **"Sports" link in the site menu**: add an entry to `config/_default/menus.en.toml`.
- **Automatic schedule refresh**: e.g. a `/sports/schedule` endpoint on the KSCU API server, or a scheduled build.
