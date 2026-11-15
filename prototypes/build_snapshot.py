"""
Refreshes the KSCU Sports schedule from Santa Clara Athletics' public calendar (.ics).

Usage (from the repo root):
    python3 prototypes/build_snapshot.py content/sports/scu-schedule.json

Safe to run on a schedule (the hourly GitHub Action runs it against the sports-data branch):
  - SCU's feed is a rolling window (~5 months). Games that have dropped off the start of the window
    are KEPT from the existing file, so results/records don't shrink over the season.
  - Inside the window, SCU's feed wins (new games, time changes, cancellations, results).
  - If SCU's site is down or returns something broken, the existing file is left untouched and the
    script exits with an error.
  - If nothing changed, the file isn't rewritten (so no empty commits).
  - Seasons roll over by themselves: anything before July 1 of the current school year is dropped, so last
    season's results and records don't linger on the page once a new year starts.
"""
import html, json, re, sys, urllib.parse, urllib.request
from datetime import date, datetime, timezone
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
        uid = re.search(r"vcal_(\d+)", f.get("UID", ("", ""))[1])  # SCU's game id, also used on its schedule pages
        games.append({"id": uid.group(1) if uid else None, "sport": sport, "home": ha.startswith("vs") and "Santa Clara" in loc,
                      "neutral": ha.startswith("vs") and "Santa Clara" not in loc, "meet": ha == "event",
                      "opponent": opp, "start": dt, "allDay": all_day, "location": loc, "result": result})
    return games

# ---------------------------------------------------------------- per-game details from SCU's schedule pages
# Each sport's schedule page (santaclarabroncos.com/sports/<slug>/schedule) lists every game with the same id as
# the calendar feed, plus the opponent's logo, the final score, and links to the box score (or results PDF) and
# recap. That's the best source for sports ESPN doesn't cover (water polo, tennis, golf, rowing, beach, XC/track).
# It's a nice-to-have: if a page can't be read, those games just keep what the calendar gave us.
SITE = "https://santaclarabroncos.com"

def slug(sport):
    s = sport.replace("Cross Country/Track", "Cross Country").lower().replace("'", "")
    return re.sub(r"[^a-z]+", "-", s).strip("-")  # "Men's Water Polo" -> "mens-water-polo"

def details_from_page(html):
    out = {}
    starts = [m.start() for m in re.finditer(r'<li class="sidearm-schedule-game ', html)]
    for a, b in zip(starts, starts[1:] + [len(html)]):
        seg = html[a:b]
        gid = re.search(r'data-game-id="(\d+)"', seg)
        if not gid:
            continue
        d = {}
        logo = re.search(r'data-src="(/images/logos/[^"?]+)', seg)
        if logo:
            d["logo"] = SITE + urllib.parse.quote(logo.group(1)) + "?width=80&height=80&mode=max"
        for href, text in re.findall(r'<a[^>]*href="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,40})', seg):
            text, href = text.strip().lower(), href.replace("&amp;", "&")
            url = href if href.startswith("http") else SITE + href
            if text in ("box score", "results", "final results", "stats") and "boxscore" not in d:
                d["boxscore"] = url
            elif text == "recap" and "recap" not in d:
                d["recap"] = url
        res = re.search(r'sidearm-schedule-game-result[^>]*>(.*?)</div>', seg, re.S)
        if res:
            m = re.match(r"([WLT]),\s*(\d+-\d+)", re.sub(r"<[^>]+>|\s+", " ", res.group(1)).strip())
            if m:
                d["score"] = ("D" if m.group(1) == "T" else m.group(1)) + " " + m.group(2)
        out.setdefault(gid.group(1), d)
    return out

def add_details(games):
    for sport in sorted({g["sport"] for g in games}):
        try:
            req = urllib.request.Request(f"{SITE}/sports/{slug(sport)}/schedule", headers={"User-Agent": "Mozilla/5.0 (KSCU sports page refresh)"})
            info = details_from_page(urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace"))
        except Exception as e:
            print(f"  (skipped {sport} details: {e})")
            continue
        for g in games:
            d = info.get(g.get("id") or "", {}) if g["sport"] == sport else {}
            for k in ("logo", "boxscore", "recap"):
                if d.get(k):
                    g[k] = d[k]
            if d.get("score") and not g.get("result"):
                g["result"] = d["score"]

# ---------------------------------------------------------------- box scores from SCU's stats pages
# Played games link to santaclarabroncos.com/sports/<slug>/stats/<season>/<opponent>/boxscore/<id>. Those pages
# have the score by period and a team stats table, which the sports page shows when you click a final score.
# A finished game's box score doesn't change, so each one is read once and then kept from the existing file.
MAX_BOX_PER_RUN = 60
BOX_VERSION = 2  # bump to re-read every box score after changing box_from_page

def cell_text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()

def table_after(page, caption):
    m = re.search(rf"<caption>{caption}</caption>", page)
    return page[m.start():page.find("</table>", m.start())] if m else ""

def box_from_page(page):
    ls = table_after(page, r"Team Score By (?:Period|Half|Quarter|Set|Inning)")
    if not ls:
        return None
    head = [cell_text(c) for c in re.findall(r"<th[^>]*>(.*?)</th>", ls.split("</thead>")[0], re.S)][1:]
    head = ["T" if re.match(r"(?i)total|f$", h) else h for h in head]
    teams = []
    for row in re.findall(r"<tr>(.*?)</tr>", ls.split("<tbody>")[-1], re.S):
        tds = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)  # the team cell is a <td> or a <th>
        if len(tds) < 2:
            continue
        full = re.search(r'hide-on-small-down">([^<]+)', tds[0])
        abbr = re.search(r'hide-on-medium">([^<]+)', tds[0])
        teams.append({"name": html.unescape(full.group(1)).strip() if full else cell_text(tds[0]),
                      "abbr": html.unescape(abbr.group(1)).strip() if abbr else "", "cells": [cell_text(t) for t in tds[1:]]})
    if len(teams) != 2:
        return None
    keep = [i for i, h in enumerate(head) if re.match(r"(?i)^(\d+|T|\d?OT\d?)$", h)]  # drop extras like "Records"
    head = [head[i] for i in keep]
    for t in teams:
        t["cells"] = [t["cells"][i] for i in keep if i < len(t["cells"])]
    stats = []
    st = table_after(page, "Team Statistics") or table_after(page, "Team Statistical Comparison")
    body = st.split("<tbody>")[-1].split("<tfoot>")[0] if st else ""
    if "header-group" in body:  # soccer: a heading row per stat, then one row per team with a "total" cell
        for label, rows in re.findall(r'header-group[^>]*>(.*?)</th>\s*</tr>(.*?)(?=<tr>\s*<th class="header-group|$)', body, re.S):
            tot = [cell_text(t) for t in re.findall(r'<td[^>]*headers="total[^"]*"[^>]*>(.*?)</td>', rows, re.S)]
            if len(tot) == 2:
                stats.append([cell_text(label), *tot])
        body = ""
    for row in re.findall(r"<tr>(.*?)</tr>", body, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if not tds:
            continue
        rest = "".join(tds[1:])
        vals = re.findall(r"<span>([^<]*)</span>", rest) if 'class="value' in row else [cell_text(t) for t in tds[1:]]
        if len(vals) == 2 and cell_text(tds[0]):
            stats.append([cell_text(tds[0]), *[v.strip() for v in vals]])
    return {"v": BOX_VERSION, "cols": head, "teams": teams, "stats": stats[:10]}  # teams/stats are in the page's order (away team first)

def add_boxes(games, old_games):
    old = {g["id"]: g["box"] for g in old_games if g.get("id") and g.get("box") and g["box"].get("v") == BOX_VERSION}
    fetched = 0
    for g in games:
        if g.get("id") in old:
            g["box"] = old[g["id"]]
            continue
        url = g.get("boxscore") or ""
        if "/boxscore/" not in url or not g.get("result") or fetched >= MAX_BOX_PER_RUN:
            continue
        fetched += 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (KSCU sports page refresh)"})
            box = box_from_page(urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace"))
        except Exception as e:
            print(f"  (skipped box score {url}: {e})")
            continue
        if box:
            g["box"] = box

def main(out_path):
    out = Path(out_path)
    old = json.loads(out.read_text()) if out.exists() else {"games": []}
    try:
        new = parse(fetch())
    except Exception as e:
        sys.exit(f"refresh failed, keeping existing schedule: {e}")
    if len(new) < MIN_GAMES:
        sys.exit(f"refresh returned only {len(new)} games, keeping existing schedule")

    today = date.today()
    season_start = date(today.year if today.month >= 7 else today.year - 1, 7, 1).isoformat()  # school year starts July 1
    window_start = min(g["start"][:10] for g in new)
    kept = [g for g in old.get("games", []) if season_start <= g["start"][:10] < window_start]  # history SCU's feed no longer shows
    games = sorted(kept + [g for g in new if g["start"][:10] >= season_start], key=lambda g: (g["start"], g["sport"], g["opponent"]))
    add_details(games)
    add_boxes(games, old.get("games", []))

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
