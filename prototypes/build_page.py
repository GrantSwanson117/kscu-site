"""
Builds the real Hugo page (content/sports/index.html) from the prototype (prototypes/sports.html).

Why a build step: the prototype is a standalone page, but on kscu.org it has to live *inside*
the theme's article layout without affecting anything else on the site. This script:
  - scopes every CSS rule under #kscu-sports (and :root/body variables onto that wrapper)
  - renames @keyframes to ks-* (Tailwind ships its own `pulse`, which we must not override)
  - renames generic element ids to ks-*
  - wraps all JavaScript in a closure so no globals leak into the site's own scripts
  - only listens for clicks inside the sports section
  - drops the prototype's stand-in header (the theme draws the real one)
  - points data/image paths at the page bundle (/sports/...)

Usage (from the repo root):  python3 prototypes/build_page.py
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "prototypes" / "sports.html"
OUT = ROOT / "content" / "sports" / "index.html"
WRAP = "#kscu-sports"

src = SRC.read_text()
css = src[src.index("<style>") + 7: src.index("</style>")]
js = src[src.index("<script>") + 8: src.rindex("</script>")]

# ---------------------------------------------------------------- ids
IDS = {"view": "ks-view", "rail": "ks-rail", "live-strip": "ks-live-strip", "footer": "ks-footer", "news": "ks-news",
       "onair": "ks-onair", "navdrop": "ks-navdrop", "navdrop-btn": "ks-navdrop-btn", "navdrop-panel": "ks-navdrop-panel"}

def rename_ids_css(text):
    for old, new in sorted(IDS.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(r"#" + re.escape(old) + r"(?![\w-])", "#" + new, text)
    return text

# ---------------------------------------------------------------- CSS scoping
def split_top(sel):
    out, depth, cur = [], 0, ""
    for ch in sel:
        if ch in "([": depth += 1
        if ch in ")]": depth -= 1
        if ch == "," and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
    out.append(cur)
    return [s.strip() for s in out if s.strip()]

def scope_selector(sel):
    if sel.startswith(":root"):
        return WRAP + sel[len(":root"):]
    if sel == "body":
        return WRAP
    if sel == "*":
        return f"{WRAP}, {WRAP} *"
    if sel.startswith("html"):
        return WRAP + sel[4:]
    return f"{WRAP} {sel}"

def scope_css(text):
    out, i, n = [], 0, len(text)
    while i < n:
        if text.startswith("/*", i):
            j = text.index("*/", i) + 2; out.append(text[i:j]); i = j; continue
        if text[i].isspace():
            out.append(text[i]); i += 1; continue
        if text.startswith("@import", i):
            j = text.index(";", text.index(")", i)) + 1; out.append(text[i:j]); i = j; continue
        brace = text.index("{", i)
        head = text[i:brace].strip()
        # find matching close brace
        depth, j = 0, brace
        while True:
            if text[j] == "{": depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0: break
            j += 1
        body = text[brace + 1: j]
        if head.startswith("@media") or head.startswith("@supports"):
            out.append(head + " {" + scope_css(body) + "}")
        elif head.startswith("@keyframes"):
            out.append(head + " {" + body + "}")
        else:
            out.append(", ".join(scope_selector(s) for s in split_top(head)) + " {" + body + "}")
        i = j + 1
    return "".join(out)

# keyframes -> ks-*
names = sorted(set(re.findall(r"@keyframes\s+([\w-]+)", css)), key=len, reverse=True)
for nm in names:
    css = re.sub(r"@keyframes\s+" + re.escape(nm) + r"(?![\w-])", "@keyframes ks-" + nm, css)
def fix_anim(m):
    val = m.group(2)
    for nm in names:
        val = re.sub(r"(?<![\w-])" + re.escape(nm) + r"(?![\w-])", "ks-" + nm, val)
    return m.group(1) + val
css = re.sub(r"(animation(?:-name)?\s*:\s*)([^;}]+)", fix_anim, css)

css = css.replace('url("img/restroom-men.png")', 'url("/sports/restroom-men.png")')
css = css.replace('url("img/restroom-women.png")', 'url("/sports/restroom-women.png")')
css = rename_ids_css(css)
IMPORT_RE = r"@import\s+url\([^)]*\)\s*;"  # font URLs contain ';' (wght@500;700), so match up to the closing paren
imports = "".join(re.findall(IMPORT_RE, css))
css = re.sub(IMPORT_RE, "", css)
css = imports + "\n" + scope_css(css)

# ---------------------------------------------------------------- JS
for old, new in IDS.items():
    js = js.replace(f'getElementById("{old}")', f'getElementById("{new}")')
js = rename_ids_css(js)  # selectors like "#rail a" inside querySelector strings
for old, new in IDS.items():  # ids written into HTML templates, e.g. <div id="onair">
    js = re.sub(r'\bid="' + re.escape(old) + r'"', f'id="{new}"', js)
js = js.replace('const SCHEDULE_URL = "scu-schedule.json";', 'const SCHEDULE_URL = "/sports/scu-schedule.json";')
js = js.replace('const ROSTER_URL = "rosters.json";', 'const ROSTER_URL = "/sports/rosters.json";')
# clicks: only inside the sports section
js = js.replace('document.addEventListener("click",', 'ROOT.addEventListener("click",')
# the header dropdown isn't part of this page (the theme owns the header) — make its code a safe no-op
js = js.replace('const dropEl = document.getElementById("ks-navdrop");\nlet dropTimer;',
                'const dropEl = document.getElementById("ks-navdrop") || document.createElement("div");\nlet dropTimer;')
js = js.replace('  document.getElementById("ks-navdrop-btn").setAttribute("aria-expanded", open);',
                '  document.getElementById("ks-navdrop-btn")?.setAttribute("aria-expanded", open);')
js = js.replace('  document.getElementById("ks-navdrop-panel").innerHTML =', '  const navPanel = document.getElementById("ks-navdrop-panel");\n  if (navPanel) navPanel.innerHTML =')
js = js.replace('setDrop(false); document.getElementById("ks-navdrop-btn").focus();', 'setDrop(false); document.getElementById("ks-navdrop-btn")?.focus();')
js = "(() => {\n\"use strict\";\nconst ROOT = document.getElementById(\"kscu-sports\");\n" + js + "\n})();\n"

# ---------------------------------------------------------------- page
FRONT = """+++
title = 'KSCU Sports'
description = 'Every Santa Clara Broncos team in one place: live scores, schedules, results, a full calendar, and KSCU play-by-play on Mixlr.'
date = 2026-11-14
showDate = false
showAuthor = false
showReadingTime = false
showEdit = false
showPagination = false
showTableOfContents = false

+++
"""
PAGE_OVERRIDES = """<style>
    /* Same page-level tweaks the Schedule and PSA pages use. These styles live inside this page's content,
       so they only apply on /sports/ — every other page keeps the theme's normal layout. */
    #metadata { display: none; }
    article>header.max-w-prose { max-width: 100%; }
    /* Use the full width the site gives the announcement box (90% of the window, up to 80rem)
       instead of the theme's narrow 896px article column. */
    #main-content { max-width: 80rem !important; width: 90%; padding-left: 0 !important; padding-right: 0 !important; }
    #content-wrapper { max-width: 100% !important; width: 100%; }
    /* Page title in the announcement-box font, like the rest of the sports page */
    #article-header h1 { font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 700; letter-spacing: -.02em; }
</style>
"""
MARKUP = """<div id="kscu-sports" class="not-prose">
  <!-- Sport sub-menu -->
  <nav class="rail" id="ks-rail" aria-label="Sports"></nav>
  <div class="score-tools" hidden>
    <button type="button" id="ks-refresh-scores" disabled>↻ Refresh scores</button>
    <span id="ks-refresh-status" role="status"></span>
  </div>
  <div class="live-strip" id="ks-live-strip" aria-live="polite"></div>
  <main id="ks-view"><div class="empty" style="margin:28px 0">Loading the Bronco calendar…</div></main>
  <footer id="ks-footer"></footer>
</div>
"""
header = ("<!--\n  KSCU Sports page. Generated from prototypes/sports.html by prototypes/build_page.py.\n"
          "  Data: /sports/scu-schedule.json (SCU Athletics calendar, refreshed by prototypes/build_snapshot.py)\n"
          "  plus live ESPN + Mixlr data fetched in the browser. Everything below is scoped to #kscu-sports.\n-->\n")
page = FRONT + header + PAGE_OVERRIDES + "<style>\n" + css + "\n</style>\n" + MARKUP + "<script>\n" + js + "</script>\n"

if "{{" in page or "{{%" in page:
    sys.exit("refusing to write: '{{' would be read as a Hugo shortcode")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(page)
print(f"wrote {OUT.relative_to(ROOT)} ({len(page):,} bytes)")
