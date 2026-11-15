"""
Refreshes the team rosters on kscu.org/sports/ from Santa Clara Athletics' roster pages.

Usage (from the repo root):
    python3 prototypes/build_rosters.py content/sports/rosters.json

Rosters only change at the start of each season, so the GitHub Action runs this twice a year
(see .github/workflows/refresh-sports-rosters.yml). It's also safe to run by hand at any time:
  - Each team comes from santaclarabroncos.com/sports/<slug>/roster (players, then coaches).
  - Photos aren't copied into the repo. The page loads them from SCU's image server, resized.
  - If a team's page can't be read, or comes back with no players, that team keeps its old roster.
  - If nothing changed, the file isn't rewritten.
"""
import html, json, re, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

SITE = "https://santaclarabroncos.com"
UA = {"User-Agent": "Mozilla/5.0 (KSCU sports page refresh)"}
# keys match the sports page's team slugs: <gender>-<sport>, except baseball and softball
TEAMS = ["mens-basketball", "womens-basketball", "mens-soccer", "womens-soccer", "womens-volleyball",
         "womens-beach-volleyball", "mens-water-polo", "womens-water-polo", "baseball", "softball",
         "mens-tennis", "womens-tennis", "mens-golf", "womens-golf", "mens-rowing", "womens-rowing",
         "mens-cross-country", "womens-cross-country"]
PHOTO = "?width=320"  # full headshot (SCU uses 2:3 portraits); the page crops from the top so heads never get cut

def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()

def field(seg, cls):
    m = re.search(rf'<(\w+)[^>]*class="{cls}[" ][^>]*>(.*?)</\1>', seg, re.S)
    return text(m.group(2)) if m else ""

def photo(seg, cls):
    m = re.search(rf'{cls}.*?data-src="(/images/[^"?]+)', seg, re.S)
    return SITE + m.group(1) + PHOTO if m else ""

def blocks(page, cls):
    starts = [m.start() for m in re.finditer(rf'<li class="{cls}[" ]', page)]
    return [page[a:b] for a, b in zip(starts, starts[1:] + [len(page)])]

def parse(page):
    players = []
    for seg in blocks(page, "sidearm-roster-player"):
        name = re.search(r'<h3>\s*<a[^>]*>(.*?)</a>', seg, re.S)
        url = re.search(r'data-player-url="([^"]+)"', seg)
        if not name:
            continue
        pos = re.search(r'sidearm-roster-player-position">\s*<span class="text-bold">(.*?)</span>', seg, re.S)
        players.append({
            "num": field(seg, "sidearm-roster-player-jersey-number"),
            "name": text(name.group(1)),
            "pos": text(pos.group(1)) if pos else "",
            "year": field(seg, "sidearm-roster-player-academic-year"),
            "ht": field(seg, "sidearm-roster-player-height"),
            "hometown": field(seg, "sidearm-roster-player-hometown"),
            "photo": photo(seg, "sidearm-roster-player-image"),
            "url": SITE + url.group(1) if url else "",
        })
    coaches = []
    for seg in blocks(page, "sidearm-roster-coach"):
        name = field(seg, "sidearm-roster-coach-name")
        if name:
            coaches.append({"name": name, "title": field(seg, "sidearm-roster-coach-title"),
                            "photo": photo(seg, "sidearm-roster-coach-image")})
    return players, coaches

def main(out_path):
    out = Path(out_path)
    old = json.loads(out.read_text()) if out.exists() else {"teams": {}}
    teams = dict(old.get("teams", {}))
    for slug in TEAMS:
        url = f"{SITE}/sports/{slug}/roster"
        try:
            page = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf-8", "replace")
            players, coaches = parse(page)
        except Exception as e:
            print(f"  {slug}: couldn't read roster, keeping the old one ({e})")
            continue
        if not players:
            print(f"  {slug}: no players found, keeping the old one")
            continue
        season = re.search(r'<option selected="" value="/sports/[^/"]+/roster/([\d-]+)"', page)
        teams[slug] = {"season": season.group(1) if season else "", "url": url, "players": players, "coaches": coaches}
        print(f"  {slug}: {len(players)} players, {len(coaches)} coaches")
    if teams == old.get("teams"):
        print("no changes")
        return
    out.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(), "teams": teams}, indent=1) + "\n")
    print(f"updated {len(teams)} rosters")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 prototypes/build_rosters.py content/sports/rosters.json")
    main(sys.argv[1])
