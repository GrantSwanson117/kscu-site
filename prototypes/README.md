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

Refresh the rosters (the GitHub Action does this on the 1st of every month):

```bash
python3 prototypes/build_rosters.py content/sports/rosters.json
```

Rebuild the page after editing `prototypes/sports.html`:

```bash
python3 prototypes/build_page.py
```

To preview, serve `prototypes/` (for example `python3 -m http.server -d prototypes`) and open `sports.html`.
`prototypes/scu-schedule.json` and `prototypes/rosters.json` are links to the copies in `content/sports/`, so the
preview always uses the same data as the site. The stand-in header at the top of `sports.html` (the "Sports"
dropdown and announcement box) sits between `proto:start` and `proto:end` comments; the build leaves it out, since
the theme draws the real header, and stops with an error if any of it is left outside those markers.

## What updates by itself (no rebuild needed)

Fetched live in the visitor's browser, free and with no API keys:
- **ESPN** — men's & women's basketball, women's volleyball, men's & women's soccer: live scores, box scores,
  logos, records, WCC standings, TV info, final scores, headlines.
- **Mixlr** — whether KSCU Sports is broadcasting right now.

Other sports (water polo, tennis, golf, XC/track) get results when `scu-schedule.json` is refreshed (hourly, by the GitHub Action).

**Where the schedule lives:** the hourly refresh commits `scu-schedule.json` to the `sports-data` branch, not to `main`,
so it never triggers a Netlify build. The page reads it from
`https://raw.githubusercontent.com/GrantSwanson117/kscu-site/sports-data/scu-schedule.json` and also loads the copy
built into the site (`content/sports/scu-schedule.json`), using whichever is newer. That built-in copy is refreshed once
a week (one Netlify build a week) so it's a reasonable fallback if GitHub is ever unreachable. Don't delete the
`sports-data` branch; it has its own `netlify.toml` telling Netlify not to build it.
The refresh also reads each sport's schedule page on santaclarabroncos.com for opponent logos and links to each game's
box score (or results PDF) and recap, and reads each new box score page once for the score by period and team stats.
Those show on the game page you get by clicking a final score (`#/game/<SCU game id>`).

Rosters come from each team's roster page and refresh on the 1st of every month (only committed when one changed).
Player photos aren't stored in the repo; the page loads them from SCU's image server.

## Keeping it running (no one needs to touch it)

- **Health check** (`.github/workflows/sports-health.yml`, Mondays): `prototypes/check_health.py` checks that the hourly
  refresh is succeeding, the schedule still has results, logos, box score links and short names, every team has a
  roster, and ESPN, Mixlr and kscu.org/sports/ respond. If anything is wrong it opens one GitHub issue, "Sports page
  needs attention", which emails the repo's watchers; it closes itself once the checks pass. Run it locally with
  `python3 prototypes/check_health.py --dry-run`.
- **Keepalive**: GitHub switches off scheduled jobs after 60 days without repo activity. The health check re-enables
  all the sports jobs every week, and the hourly refresh re-enables the health check, so a quiet summer can't stop them.
- **Dependabot** (`.github/dependabot.yml`) opens a pull request when the GitHub Actions these jobs use need updating.
  Merge it when it shows up (about once a year).
- The repo lives on a personal GitHub account; moving it to a KSCU organization keeps the data feed independent of
  any one person.
