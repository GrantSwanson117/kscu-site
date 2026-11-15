"""
Weekly health check for kscu.org/sports/ (run by .github/workflows/sports-health.yml).

The sports page runs by itself, so nobody would notice if a source quietly changed. This checks the things that
can break without anyone touching the site, and keeps ONE GitHub issue ("Sports page needs attention") up to date:
  - opens it (which emails the repo's watchers) when something is wrong, with what to look at,
  - adds a comment if it's still wrong a week later,
  - closes it by itself once everything passes again.

Checks:
  1. The hourly schedule refresh is actually running and succeeding.
  2. The schedule data looks healthy: enough games, recent results filled in, and SCU's pages still giving logos,
     box score links and short names (if those all vanish, SCU or ESPN changed their site).
  3. Every team has a roster.
  4. ESPN, Mixlr and the live page itself respond.

Usage (needs GITHUB_TOKEN and GITHUB_REPOSITORY, both set automatically inside GitHub Actions):
    python3 prototypes/check_health.py            # check and update the issue
    python3 prototypes/check_health.py --dry-run  # check and print, don't touch GitHub issues
"""
import json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone

REPO = os.environ.get("GITHUB_REPOSITORY", "GrantSwanson117/kscu-site")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
DRY = "--dry-run" in sys.argv
TITLE = "Sports page needs attention"
DATA_URL = f"https://raw.githubusercontent.com/{REPO}/sports-data/scu-schedule.json"
NOW = datetime.now(timezone.utc)

def get(url, as_json=True, gh=False):
    headers = {"User-Agent": "KSCU sports health check"}
    if gh:
        headers["Accept"] = "application/vnd.github+json"
        if TOKEN:
            headers["Authorization"] = f"Bearer {TOKEN}"
    body = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60).read()
    return json.loads(body) if as_json else body.decode("utf-8", "replace")

def gh(method, path, payload=None):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}{path}", method=method,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {TOKEN}",
                                          "User-Agent": "KSCU sports health check", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")

def when(g):
    s = g["start"]
    return datetime.fromisoformat(s + "T12:00:00+00:00") if g.get("allDay") else datetime.fromisoformat(s)

problems = []

def check(name, fn):
    try:
        msg = fn()
        if msg:
            problems.append(f"**{name}:** {msg}")
    except Exception as e:
        problems.append(f"**{name}:** couldn't check ({e})")

def refresh_runs():
    runs = get(f"https://api.github.com/repos/{REPO}/actions/workflows/refresh-sports-schedule.yml/runs?per_page=30", gh=True)["workflow_runs"]
    done = [r for r in runs if r["status"] == "completed"]
    ok = [r for r in done if r["conclusion"] == "success"]
    if not ok:
        return "no successful runs of the hourly schedule refresh. Check GitHub > Actions > Refresh sports schedule."
    last = datetime.fromisoformat(ok[0]["updated_at"].replace("Z", "+00:00"))
    if NOW - last > timedelta(hours=36):
        return (f"the hourly schedule refresh last succeeded {last:%b %d %H:%M} UTC. Check GitHub > Actions > Refresh sports "
                f"schedule (is it disabled, or failing?).")
    if len(done) >= 6 and all(r["conclusion"] != "success" for r in done[:6]):
        return "the last 6 schedule refreshes failed. Open the latest run's log in GitHub > Actions."

def schedule_data():
    d = get(DATA_URL)
    games = d.get("games", [])
    if len(games) < 5:
        return f"the schedule only has {len(games)} games. SCU's calendar feed may have changed."
    issues = []
    h2h = [g for g in games if not g.get("meet")]
    recent = [g for g in h2h if NOW - timedelta(days=45) <= when(g) <= NOW - timedelta(days=1)]
    played = [g for g in recent if g.get("result")]
    if len(recent) >= 4 and len(played) == 0:
        issues.append("no results for any game in the last 45 days (SCU's calendar may have stopped including scores)")
    stuck = [g for g in h2h if NOW - timedelta(days=10) <= when(g) <= NOW - timedelta(days=3) and not g.get("result") and not g.get("allDay")]
    if len(stuck) >= 4:
        issues.append(f"{len(stuck)} games from the past week still have no result")
    if len(played) >= 5 and not any(g.get("boxscore") or g.get("recap") for g in played):
        issues.append("none of the recent games have box score or recap links (SCU's schedule pages may have changed)")
    if len(h2h) >= 10 and not any(g.get("logo") for g in h2h):
        issues.append("no opponent logos (SCU's schedule pages may have changed)")
    if len(h2h) >= 10 and not any(g.get("abbr") for g in h2h):
        issues.append("no short team names (ESPN's team list may have moved)")
    return "; ".join(issues) + "." if issues else None

def rosters():
    path = os.path.join(os.path.dirname(__file__), "..", "content", "sports", "rosters.json")
    teams = json.load(open(path)).get("teams", {})
    empty = [k for k, t in teams.items() if not t.get("players")]
    if len(teams) < 15 or empty:
        return f"{len(teams)} rosters, empty: {', '.join(empty) or 'none'}. Run GitHub > Actions > Refresh sports rosters."

def espn():
    d = get("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/2541/schedule")
    if not d.get("events"):
        return "ESPN returned no Santa Clara games; live scores won't show. ESPN may have changed its API."

def mixlr():
    d = get("https://api.mixlr.com/users/kscusports")
    if "is_live" not in d:
        return "Mixlr's status API changed; the 'on air' bar and live banner may be wrong."

def live_page():
    html = get("https://kscu.org/sports/", as_json=False)
    if "kscu-sports" not in html:
        return "kscu.org/sports/ loaded but the sports section is missing."

check("Schedule refresh", refresh_runs)
check("Schedule data", schedule_data)
check("Rosters", rosters)
check("ESPN live scores", espn)
check("Mixlr", mixlr)
check("Live page", live_page)

print("\n".join(problems) if problems else "All sports checks pass.")
if DRY or not TOKEN:
    sys.exit(1 if problems else 0)

open_issue = next((i for i in gh("GET", "/issues?state=open&per_page=100") if i["title"] == TITLE and "pull_request" not in i), None)
if problems:
    body = ("The weekly check of kscu.org/sports/ found something to look at:\n\n" + "\n".join(f"- {p}" for p in problems) +
            f"\n\nChecked {NOW:%b %d, %Y %H:%M} UTC. This issue closes itself when the checks pass again. "
            "How the page works: prototypes/README.md.")
    if open_issue:
        gh("POST", f"/issues/{open_issue['number']}/comments", {"body": body})
    else:
        gh("POST", "/issues", {"title": TITLE, "body": body})
    sys.exit(1)  # also marks the run as failed, so GitHub emails whoever maintains the workflow
elif open_issue:
    gh("POST", f"/issues/{open_issue['number']}/comments", {"body": f"All checks pass again ({NOW:%b %d, %Y}). Closing."})
    gh("PATCH", f"/issues/{open_issue['number']}", {"state": "closed"})
