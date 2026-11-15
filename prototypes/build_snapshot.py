# Turns Santa Clara Athletics' public calendar (.ics) into a simple JSON list of games.
# Later this same logic would live in the KSCU FastAPI server as a /sports/schedule endpoint.
import json, re, sys, urllib.request
from datetime import datetime, timezone

URL = "https://santaclarabroncos.com/calendar.ashx/calendar.ics"
raw = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})).read().decode()
raw = re.sub(r"\r?\n[ \t]", "", raw)  # unfold wrapped lines

games = []
for block in raw.split("BEGIN:VEVENT")[1:]:
    f = {}
    for line in block.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            f.setdefault(k.split(";")[0], (k, v))
    summary = f.get("SUMMARY", ("", ""))[1].replace("\\,", ",").strip()
    m = re.match(r"(?:\[(\w)\]\s*)?Santa Clara University (.+?) (vs\.?|at) (.+)", summary)
    m2 = re.match(r"(?:\[(\w)\]\s*)?Santa Clara University (.+?)\s{2,}(.+)", summary)
    if m:  # head-to-head game, e.g. "Women's Volleyball vs Pacific"
        sport, ha, opp = m.group(2), m.group(3), m.group(4).split(" - ")[0].strip()
    elif m2:  # meet/tournament, e.g. "Men's Cross Country/Track  Bronco Invitational"
        sport, ha, opp = m2.group(2), "event", m2.group(3).strip()
    else:
        continue
    k, v = f.get("DTSTART", ("", ""))
    if "VALUE=DATE" in k:
        dt, all_day = datetime.strptime(v, "%Y%m%d").strftime("%Y-%m-%d"), True
    else:
        dt, all_day = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).isoformat(), False
    desc = f.get("DESCRIPTION", ("", ""))[1].replace("\\,", ",").split("\\n")
    result = next((d.strip() for d in desc[1:3] if re.match(r"^([WLTD] \d|\d+(st|nd|rd|th) of)", d.strip())), None)
    if result and result.startswith("T "):  # show ties as draws
        result = "D" + result[1:]
    games.append({"sport": sport, "home": ha.startswith("vs") and "Santa Clara" in f.get("LOCATION", ("", ""))[1], "neutral": ha.startswith("vs") and "Santa Clara" not in f.get("LOCATION", ("", ""))[1], "meet": ha == "event", "opponent": opp, "start": dt, "allDay": all_day,
                  "location": f.get("LOCATION", ("", ""))[1].replace("\\,", ","), "result": result})

games.sort(key=lambda g: g["start"])
json.dump({"updated": datetime.now(timezone.utc).isoformat(), "games": games}, open(sys.argv[1], "w"), indent=1)
print(len(games), "games;", sorted({g["sport"] for g in games}))
