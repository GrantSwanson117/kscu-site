# sports-data

Live data for kscu.org/sports/, kept separate from the website so updates don't trigger a Netlify rebuild.

- `scu-schedule.json`: Santa Clara Athletics schedule, results and box scores. The "Refresh sports schedule"
  GitHub Action (on `main`) updates it hourly. The sports page reads it from
  `https://raw.githubusercontent.com/GrantSwanson117/kscu-site/sports-data/scu-schedule.json` and falls back to
  the copy built into the site (`content/sports/scu-schedule.json` on `main`, refreshed weekly).

Don't delete this branch, and don't edit it by hand; the Action overwrites it.
