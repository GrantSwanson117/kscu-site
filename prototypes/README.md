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

## Common tasks (run from the repo root)

Refresh the schedule (new games, times, results for non-ESPN sports):

```bash
python3 prototypes/build_snapshot.py content/sports/scu-schedule.json
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

Other sports (water polo, tennis, golf, XC/track) get results only when `scu-schedule.json` is refreshed (every 6 hours).
The refresh also reads each sport's schedule page on santaclarabroncos.com for opponent logos and links to each game's
box score (or results PDF) and recap.

## Not done yet (needs changes outside the sports page)

- A **"Sports" link in the site menu**: add an entry to `config/_default/menus.en.toml`.
- **Automatic schedule refresh**: e.g. a `/sports/schedule` endpoint on the KSCU API server, or a scheduled build.
