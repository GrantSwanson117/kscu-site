// Songs on the Schedule page.
//
// Click a show in the schedule to see what it has played. The station API (kscuapi.org/tracks/recent) only gives
// the last 10 songs, each with the time it played, so:
//   - the show on air now lists the songs played since it started (up to the last 10)
//   - a show that ended recently lists whichever of its songs are still among the last 10
//   - any other show says full playlists are coming, and shows the last 10 songs on KSCU instead
// "Recently played" above the schedule opens a pop-up timeline: the song on air now, then the ones before it.
// The show on air right now gets a LIVE tag on its block. Both work from the schedule the API returns, so they follow
// new quarters' schedules on their own.
// Show times are Pacific wall-clock minutes, song times are UTC, so both are compared as Pacific minutes.
(() => {
    const API = 'https://kscuapi.org/tracks/recent';
    const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const TZ = 'America/Los_Angeles';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' });
    const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    // minutes since 1970 on the Pacific wall clock, plus the Pacific weekday
    function pacific(date) {
        const p = Object.fromEntries(parts.formatToParts(date).map(x => [x.type, x.value]));
        const days = Date.UTC(+p.year, +p.month - 1, +p.day) / 864e5;
        return { mins: days * 1440 + (+p.hour) * 60 + (+p.minute), dow: WD[p.weekday], minOfDay: (+p.hour) * 60 + (+p.minute) };
    }

    // the most recent airing of a weekly slot that has started by now: [start, end] in Pacific minutes
    function lastAiring(show, now) {
        const dow = DAY_KEYS.indexOf(show.day);
        const len = ((show.end - show.start) + 1440) % 1440 || 1440;
        let start = now.mins - now.minOfDay - ((now.dow - dow + 7) % 7) * 1440 + show.start;
        if (start > now.mins) start -= 7 * 1440;
        return [start, start + len];
    }

    const safeUrl = u => /^https:\/\//.test(u || '') ? u : '';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const clock = d => d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
    const fmtMins = m => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? 'pm' : 'am';
        return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ap}`; };

    let tracks = null, loadedAt = 0, current = null, timer = null;

    async function loadTracks() {
        if (tracks && Date.now() - loadedAt < 30e3) return tracks;
        const r = await fetch(API, { cache: 'no-cache', signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(r.status);
        tracks = (await r.json()).filter(t => t && t.played_at).map(t => ({ ...t, at: new Date(t.played_at) }))
            .sort((a, b) => b.at - a.at);
        loadedAt = Date.now();
        return tracks;
    }

    const art = t => safeUrl(t.image) ? `<img class="songs-art" src="${esc(t.image)}" alt="" loading="lazy">` : `<span class="songs-art"></span>`;
    // a song row (or the big card) links to Spotify when the API gives a link
    const wrap = (t, cls, inner) => safeUrl(t.link)
        ? `<a class="${cls}" href="${esc(t.link)}" target="_blank" rel="noopener" aria-label="${esc(t.name)} by ${esc(t.artists)}, open on Spotify">${inner}</a>`
        : `<div class="${cls}">${inner}</div>`;

    function songList(list) {
        return `<ol class="songs-list">${list.map(t => `<li>${wrap(t, 'songs-row', `
                <span class="songs-time">${esc(clock(t.at))}</span>
                ${art(t)}
                <span class="songs-what"><b class="songs-title">${esc(t.name)}</b><span class="songs-artist">${esc(t.artists)}</span></span>
                ${safeUrl(t.link) ? '<i class="songs-go fa fa-spotify" aria-hidden="true"></i>' : '<span></span>'}`)}</li>`).join('')}</ol>`;
    }

    // the big card for the newest song
    function hero(t, tag, live) {
        return wrap(t, 'songs-hero', `
            ${art(t)}
            <span class="songs-hero-text">
                <span class="songs-tag">${live ? '<span class="songs-live"></span>' : ''}${esc(tag)} · ${esc(clock(t.at))}</span>
                <b class="songs-title">${esc(t.name)}</b>
                <span class="songs-artist">${esc(t.artists)}</span>
                ${safeUrl(t.link) ? '<span class="songs-cta"><i class="fa fa-spotify"></i>Play on Spotify</span>' : ''}
            </span>`);
    }

    const label = (text, n) => `<p class="songs-label">${esc(text)}<span>${n} song${n === 1 ? '' : 's'}</span></p>`;
    const callout = (icon, text) => `<p class="songs-callout"><i class="fa fa-${icon}" aria-hidden="true"></i><span>${text}</span></p>`;
    // newest song as a card, the rest as a list
    const latest = (list, tag, rest = 'EARLIER') => hero(list[0], tag) + (list.length > 1 ? label(rest, list.length - 1) + songList(list.slice(1)) : '');
    const airDate = start => new Date(start * 6e4).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

    function body(show, list) {
        if (!list.length) return `<p class="songs-msg">No songs logged yet. Check back once something's on air.</p>`;
        const now = pacific(new Date());
        const [start, end] = lastAiring(show, now);
        const onAir = now.mins < end;
        const mine = list.filter(t => { const m = pacific(t.at).mins; return m >= start && m < end; });
        const oldest = pacific(list[list.length - 1].at).mins;
        const cutOff = mine.length && oldest > start; // some of this show's earlier songs aren't in the recent list
        const later = cutOff ? callout('info-circle', 'Only the most recent songs are shown. Earlier songs from this show will appear once full playlists are added.') : '';
        if (!mine.length) {
            return callout('clock-o', onAir
                ? 'This show is on now, but no songs are logged yet. They show up here as they play.'
                : 'Full playlists for every show are coming soon. Until then, here’s what just played on KSCU.')
                + latest(list, 'LATEST ON KSCU');
        }
        if (onAir) return `<div>${hero(mine[0], 'ON AIR NOW', true)}</div>`
            + (mine.length > 1 ? label('EARLIER IN THIS SHOW', mine.length - 1) + songList(mine.slice(1)) : '') + later;
        return label(`LAST SHOW · ${airDate(start)}`, mine.length) + songList(mine) + later;
    }

    async function render() {
        const box = document.getElementById('songs-body');
        try {
            box.innerHTML = body(current, await loadTracks())
                + `<p class="songs-foot">Updated ${esc(clock(new Date()))} · refreshes every minute</p>`;
        } catch (e) {
            box.innerHTML = `<p class="songs-msg">Couldn't load songs right now. Try again in a minute.</p>`;
        }
    }

    function open(show) {
        const dlg = document.getElementById('songs-dialog');
        current = show;
        document.getElementById('songs-title').textContent = show.title || 'KSCU';
        document.getElementById('songs-sub').textContent =
            [show.dj ? `with ${show.dj}` : '', `${show.day[0].toUpperCase() + show.day.slice(1)}s ${fmtMins(show.start)}–${fmtMins(show.end)}`].filter(Boolean).join(' · ');
        document.getElementById('songs-body').innerHTML = `<p class="songs-msg">Loading songs…</p>`;
        if (!dlg.open) dlg.showModal();
        render();
        clearInterval(timer);
        timer = setInterval(() => { tracks = null; render(); }, 60e3); // keeps an on-air list current while it's open
    }

    function showFrom(block) {
        const d = block.dataset;
        return { day: d.day, start: +d.start, end: +d.end, title: d.title, dj: d.dj };
    }

    document.addEventListener('click', e => {
        const block = e.target.closest('.schedule-block[data-day]');
        if (block) return open(showFrom(block));
        if (e.target.closest('#songs-close') || e.target.id === 'songs-dialog') document.getElementById('songs-dialog').close();
    });
    document.addEventListener('keydown', e => {
        const block = e.target.closest?.('.schedule-block[data-day]');
        if (block && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(showFrom(block)); }
    });
    document.getElementById('songs-dialog')?.addEventListener('close', () => clearInterval(timer));

    // LIVE tag on whichever show is on air now
    function markLive() {
        const now = pacific(new Date());
        document.querySelectorAll('.schedule-block[data-day]').forEach(block => {
            const live = lastAiring(showFrom(block), now)[1] > now.mins;
            if (live === block.classList.contains('is-live')) return;
            block.classList.toggle('is-live', live);
            if (live) block.insertAdjacentHTML('afterbegin', '<span class="schedule-live"><i></i>LIVE</span>');
            else block.querySelector('.schedule-live')?.remove();
            block.setAttribute('aria-label', `${block.dataset.title || 'Show'}${live ? ' (on air now)' : ''}: see songs played`);
        });
    }
    const target = document.getElementById('schedule-target');
    if (target) new MutationObserver(markLive).observe(target, { childList: true });
    markLive();
    setInterval(markLive, 30e3);

    // ---------- recently played pop-up ----------
    // "Recently played" above the schedule opens a timeline of the latest songs. The song on air now
    // (kscuapi.org/tracks/current) stands at the NOW end on the right, with a running red border, and the songs before
    // it (tracks/recent) go back to the left, each labelled with how long ago it played. It only moves when clicked,
    // stops at both ends, and keeps its labels and the on-air song up to date while open.
    const CURRENT = 'https://kscuapi.org/tracks/current';
    const recentDlg = document.getElementById('recent-dialog');
    const recentBody = document.getElementById('recent-body');
    let carouselKey = '', carouselPoll = null, relabel = null;

    function since(t) {
        const m = Math.max(0, Math.round((Date.now() - t.at) / 60e3));
        if (m < 1) return 'JUST NOW';
        if (m < 60) return `${m} MIN AGO`;
        const h = Math.floor(m / 60), r = m % 60;
        return h >= 24 ? `${Math.floor(h / 24)} DAY${h >= 48 ? 'S' : ''} AGO` : `${h} HR${r ? ` ${r} MIN` : ''} AGO`;
    }
    // the hand-drawn frame for the song on air: three slightly different wobbly squares shown in turn, plus red
    // vibration marks at the corners (cover is 0-100 in these units)
    const COMIC = `<svg class="rp-comic" viewBox="-16 -16 132 132" aria-hidden="true">
        <g class="rp-boil">
            <path d="M-4,-5 C25,-3 60,-7 104,-4 C106,30 103,65 105,104 C70,106 35,103 -5,105 C-3,70 -6,35 -4,-5 Z"/>
            <path d="M-5,-3 C30,-6 70,-3 105,-5 C103,35 106,70 104,105 C65,103 30,106 -4,104 C-6,65 -3,30 -5,-3 Z"/>
            <path d="M-3,-4 C35,-5 65,-2 104,-6 C105,25 104,60 106,103 C75,105 40,104 -6,106 C-4,75 -5,40 -3,-4 Z"/>
        </g>
        <g class="rp-buzz"><path d="M-9,-1 L-15,1 M-8,-8 L-13,-13 M-1,-9 L1,-15 M109,101 L115,99 M108,108 L113,113 M101,109 L99,115"/></g>
        <g class="rp-buzz"><path d="M109,-1 L115,1 M108,-8 L113,-13 M101,-9 L99,-15 M-9,101 L-15,99 M-8,108 L-13,113 M-1,109 L1,115"/></g>
    </svg>`;
    const ageLabel = t => t.now ? 'NOW PLAYING' : since(t);

    async function loadCurrent() {
        try {
            const r = await fetch(CURRENT, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
            const c = r.ok ? await r.json() : null;
            return c && c.name ? c : null;
        } catch (e) { return null; }
    }
    // the song on air first, then the ones before it (the recent list may already include it)
    function timeline(recent, current) {
        const list = recent.slice();
        if (current) {
            if (list[0] && list[0].id && list[0].id === current.id) list[0] = { ...list[0], now: true };
            else list.unshift({ ...current, now: true });
        }
        return list;
    }

    function buildCarousel(list) {
        relabel = null;
        if (!list.length) { recentBody.innerHTML = '<p class="rp-msg">No songs logged yet. Check back once something\'s on air.</p>'; return; }
        const N = list.length, live = !!list[0].now;
        const narrow = recentBody.clientWidth < 420;
        const s = narrow ? 104 : 132, gap = narrow ? 1.06 : 1.22; // cover size, and how far apart neighbours sit
        const art = t => safeUrl(t.image) ? `<img src="${esc(t.image)}" alt="" loading="lazy">` : '';
        recentBody.innerHTML = `
            <div class="rp-stage" style="--s:${s}px"><div class="rp-axis"></div>
                ${live ? '' : '<div class="rp-nowmark" aria-hidden="true"><i></i><b>NOW</b></div>'}
                ${list.map(t => `<div class="rp-item${t.now ? ' is-now' : ''}">
                    <button type="button" aria-label="${esc(t.name)} by ${esc(t.artists)}">${art(t)}${t.now
                        ? '<span class="rp-badge"><span class="rp-eq" aria-hidden="true"><i></i><i></i><i></i></span>ON AIR</span>' + COMIC + '' : ''}</button>
                    <span class="rp-dot"></span><span class="rp-label">${ageLabel(t)}</span></div>`).join('')}
            </div>
            <div class="rp-now"></div>
            <div class="rp-foot"><span class="rp-info"></span>
                <div class="rp-arrows"><button type="button" data-d="1">◀ EARLIER</button><button type="button" data-d="-1">LATER ▶</button></div></div>`;
        const items = [...recentBody.querySelectorAll('.rp-item')], mark = recentBody.querySelector('.rp-nowmark');
        const now = recentBody.querySelector('.rp-now'), info = recentBody.querySelector('.rp-info');
        const arrows = [...recentBody.querySelectorAll('.rp-arrows button')];
        let cur = 0;
        function go(i) {
            cur = Math.max(0, Math.min(N - 1, i));
            items.forEach((c, k) => {
                const o = cur - k, a = Math.abs(o); // earlier songs to the left
                c.style.transform = `translateX(${o * s * gap}px) scale(${o ? .64 : 1})`;
                c.style.opacity = a > 2 ? 0 : 1;
                c.style.zIndex = 20 - a;
                c.style.pointerEvents = a > 2 ? 'none' : '';
                c.style.filter = o ? 'grayscale(.5) brightness(.82)' : 'none';
                c.querySelector('button').tabIndex = o ? -1 : 0;
                c.classList.toggle('on', !o);
            });
            if (mark) { // NOW sits just past the newest song
                const o = cur + 1;
                mark.style.transform = `translateX(${o === 1 ? s / 2 + 40 : o * s * gap}px)`;
                mark.style.opacity = o > 2 ? 0 : 1;
            }
            const t = list[cur];
            now.innerHTML = `<span class="rp-art">${safeUrl(t.image) ? `<img src="${esc(t.image)}" alt="">` : ''}</span>
                <span class="rp-what">${safeUrl(t.link)
                    ? `<a class="rp-title" href="${esc(t.link)}" target="_blank" rel="noopener">${esc(t.name)}</a>`
                    : `<b class="rp-title">${esc(t.name)}</b>`}<span class="rp-by">${esc(t.artists)}</span></span>
                <span class="rp-when"><b>${ageLabel(t)}</b>${t.now ? 'on 103.3 FM' : esc(clock(t.at))}</span>`;
            const back = live ? cur : cur + 1;
            info.textContent = t.now ? 'ON AIR NOW' : !cur ? 'THE LATEST SONG' : `${back} SONG${back > 1 ? 'S' : ''} BACK`;
            arrows.forEach(b => b.disabled = cur + +b.dataset.d < 0 || cur + +b.dataset.d > N - 1);
        }
        items.forEach((c, k) => c.querySelector('button').addEventListener('click', () =>
            k === cur && safeUrl(list[k].link) ? window.open(list[k].link, '_blank', 'noopener') : go(k)));
        arrows.forEach(b => b.addEventListener('click', () => go(cur + +b.dataset.d)));
        go(0);
        relabel = () => { items.forEach((c, k) => c.querySelector('.rp-label').textContent = ageLabel(list[k])); go(cur); };
    }

    async function refreshCarousel() {
        try {
            tracks = null;
            const [recent, current] = await Promise.all([loadTracks(), loadCurrent()]);
            const list = timeline(recent, current);
            const key = list.map(t => t.now ? `now:${t.id || t.name}` : t.played_at).join();
            if (key !== carouselKey) { carouselKey = key; buildCarousel(list); }
            else if (relabel) relabel(); // same songs: just bring the "min ago" labels up to date
        } catch (e) {
            if (!carouselKey) recentBody.innerHTML = '<p class="rp-msg">Couldn\'t load songs right now. Try again in a minute.</p>';
        }
    }

    if (recentDlg) {
        document.getElementById('recent-open').addEventListener('click', () => {
            recentDlg.showModal();
            refreshCarousel();
            carouselPoll = setInterval(refreshCarousel, 30e3); // new songs and fresh "min ago" labels while it's open
        });
        document.getElementById('recent-close').addEventListener('click', () => recentDlg.close());
        recentDlg.addEventListener('click', e => { if (e.target === recentDlg) recentDlg.close(); }); // click outside the box
        recentDlg.addEventListener('close', () => { clearInterval(carouselPoll); carouselKey = ''; relabel = null; });
    }
})();
