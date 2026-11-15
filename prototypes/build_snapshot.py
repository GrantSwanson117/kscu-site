"""
Refreshes the KSCU Sports schedule from Santa Clara Athletics' public calendar (.ics).

Usage (from the repo root):
    python3 prototypes/build_snapshot.py content/sports/scu-schedule.json

Safe to run on a schedule (the daily GitHub Action does):
  - SCU's feed is a rolling window (~5 months). Games that have dropped off the start of the window
    are KEPT from the existing file, so results/records don't shrink over the season.
  - Inside the window, SCU's feed wins (new games, time changes, cancellations, results).
  - If SCU's site is down or returns something broken, the existing file is left untouched and the
    script exits with an error.
  - If nothing changed, the file isn't rewritten (so no empty daily commits).
"""
import json, re, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://santaclarabroncos.com/calendar.ashx/calendar.ics"
MIN_GAMES = 5  # anything less means the feed is broken, not that the season is empty

def fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (KSCU sports page refresh)"})
    raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    if "BEGIN:VCALENDAR" not in raw:
        raise ValueError("response is not an iCalendar feed")
    return re.sub(r"\r?\n[ \t]", "", raw)  # unfold wrapped lines

def parse(raw):
    games = []
    for block in raw.split("BEGIN:VEVENT")[1:]:
        f = {}
        for line in block.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                f.setdefault(k.split(";")[0], (k, v))
        summary = f.get("SUMMARY", ("", ""))[1].replace("\\,", ",").strip()
        # sport names may or may not have a prefix: "Women's Volleyball vs Pacific", "Baseball at Pacific"
        m = re.match(r"(?:\[(\w)\]\s*)?Santa Clara University (.+?) (vs\.?|at) (.+)", summary)
        m2 = re.match(r"(?:\[(\w)\]\s*)?Santa Clara University (.+?)\s{2,}(.+)", summary)
        if m:  # head-to-head game
            sport, ha, opp = m.group(2), m.group(3), m.group(4).split(" - ")[0].strip()
        elif m2:  # meet/tournament, e.g. "Men's Cross Country/Track  Bronco Invitational"
            sport, ha, opp = m2.group(2), "event", m2.group(3).strip()
        else:
            continue
        k, v = f.get("DTSTART", ("", ""))
        try:
            if "VALUE=DATE" in k:
                dt, all_day = datetime.strptime(v, "%Y%m%d").strftime("%Y-%m-%d"), True
            else:
                dt, all_day = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).isoformat(), False
        except ValueError:
            continue
        loc = f.get("LOCATION", ("", ""))[1].replace("\\,", ",")
        desc = f.get("DESCRIPTION", ("", ""))[1].replace("\\,", ",").split("\\n")
        result = next((d.strip() for d in desc[1:3] if re.match(r"^([WLTD] \d|\d+(st|nd|rd|th) of)", d.strip())), None)
        if result and result.startswith("T "):  # show ties as draws
            result = "D" + result[1:]
        games.append({"sport": sport, "home": ha.startswith("vs") and "Santa Clara" in loc,
                      "neutral": ha.startswith("vs") and "Santa Clara" not in loc, "meet": ha == "event",
                      "opponent": opp, "start": dt, "allDay": all_day, "location": loc, "result": result})
    return games

def main(out_path):
    out = Path(out_path)
    old = json.loads(out.read_text()) if out.exists() else {"games": []}
    try:
        new = parse(fetch())
    except Exception as e:
        sys.exit(f"refresh failed, keeping existing schedule: {e}")
    if len(new) < MIN_GAMES:
        sys.exit(f"refresh returned only {len(new)} games, keeping existing schedule")

    window_start = min(g["start"][:10] for g in new)
    kept = [g for g in old.get("games", []) if g["start"][:10] < window_start]  # history SCU's feed no longer shows
    games = sorted(kept + new, key=lambda g: (g["start"], g["sport"], g["opponent"]))

    if games == old.get("games"):
        print(f"no changes ({len(games)} games)")
        return
    out.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(), "games": games}, indent=1) + "\n")
    print(f"updated: {len(games)} games ({len(kept)} kept from history, {len(new)} from SCU);",
          sorted({g["sport"] for g in games}))

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 prototypes/build_snapshot.py content/sports/scu-schedule.json")
    main(sys.argv[1])
