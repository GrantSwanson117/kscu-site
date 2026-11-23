// Songs on the Schedule page.
//
// Click a show in the schedule to see what it has played. The station API (kscuapi.org/tracks/recent) only gives
// the last 10 songs, each with the time it played, so:
//   - the show on air now lists the songs played since it started (up to the last 10)
//   - a show that ended recently lists whichever of its songs are still among the last 10
//   - any other show says full playlists are coming, and shows the last 10 songs on KSCU instead
// "Recently played" above the schedule opens a pop-up with a carousel of the latest songs' covers.
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
    // "Recently played" above the schedule opens a box with a carousel of the latest songs' covers, newest first.
    // The front cover is full size with a sticker saying how long ago it played, and the song is named below it.
    // Click a side cover (or a square, or an arrow) to bring it to the front, or the front cover to play it on Spotify.
    // It moves on every few seconds while open, pauses while the pointer or keyboard focus is on the covers, and
    // holds still for people who turn off motion.
    const recentDlg = document.getElementById('recent-dialog');
    const recentBody = document.getElementById('recent-body');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let carouselKey = '', carouselTurn = null, carouselPoll = null;
    const ago = i => i ? `${i} SONG${i > 1 ? 'S' : ''} AGO` : 'LATEST';

    function buildCarousel(list) {
        clearInterval(carouselTurn);
        if (!list.length) { recentBody.innerHTML = '<p class="rp-msg">No songs logged yet. Check back once something\'s on air.</p>'; return; }
        const N = list.length;
        const narrow = recentBody.clientWidth < 420;
        const s = narrow ? 120 : 160, gap = narrow ? .74 : .86; // cover size, and how far apart neighbours sit
        recentBody.innerHTML = `
            <div class="rp-stage" style="--s:${s}px">${list.map(t => `
                <button type="button" aria-label="${esc(t.name)} by ${esc(t.artists)}">${safeUrl(t.image) ? `<img src="${esc(t.image)}" alt="" loading="lazy">` : ''}</button>`).join('')}
                <span class="rp-sticker" aria-hidden="true"></span></div>
            <div class="rp-now"></div>
            <div class="rp-foot">
                <div class="rp-dots">${list.map((t, i) => `<button type="button" aria-label="${esc(ago(i).toLowerCase())}: ${esc(t.name)}"></button>`).join('')}</div>
                <div class="rp-arrows"><button type="button" data-d="-1" aria-label="Newer song">◀</button><button type="button" data-d="1" aria-label="Older song">▶</button></div>
            </div>`;
        const stage = recentBody.querySelector('.rp-stage'), now = recentBody.querySelector('.rp-now');
        const covers = [...stage.querySelectorAll('button')], dots = [...recentBody.querySelectorAll('.rp-dots button')];
        let cur = 0;
        function go(i) {
            cur = ((i % N) + N) % N;
            covers.forEach((c, k) => {
                let o = ((k - cur) % N + N) % N; if (o > N / 2) o -= N; // places from the front, either side
                const a = Math.abs(o);
                c.style.transform = `translateX(${o * s * gap}px) scale(${o ? .72 - (a - 1) * .08 : 1})`;
                c.style.zIndex = 20 - a;
                c.style.opacity = a > 2 ? 0 : 1; // two either side show
                c.style.pointerEvents = a > 2 ? 'none' : '';
                c.style.filter = o ? 'grayscale(.5) brightness(.8)' : 'none';
                c.tabIndex = o ? -1 : 0;
                c.classList.toggle('on', k === cur);
            });
            dots.forEach((c, k) => c.classList.toggle('on', k === cur));
            const sticker = stage.querySelector('.rp-sticker'), fresh = sticker.cloneNode(); // a new node replays the pop-on
            fresh.textContent = ago(cur); sticker.replaceWith(fresh);
            const t = list[cur];
            now.innerHTML = `<span class="rp-art">${safeUrl(t.image) ? `<img src="${esc(t.image)}" alt="">` : ''}</span>
                <span class="rp-what">${safeUrl(t.link)
                    ? `<a class="rp-title" href="${esc(t.link)}" target="_blank" rel="noopener">${esc(t.name)}</a>`
                    : `<b class="rp-title">${esc(t.name)}</b>`}<span class="rp-by">${esc(t.artists)}</span></span>
                <span class="rp-when"><b>${ago(cur)}</b>${esc(clock(t.at))}</span>`;
        }
        covers.forEach((c, k) => c.addEventListener('click', () =>
            k === cur && safeUrl(list[k].link) ? window.open(list[k].link, '_blank', 'noopener') : go(k)));
        dots.forEach((c, k) => c.addEventListener('click', () => go(k)));
        recentBody.querySelectorAll('.rp-arrows button').forEach(b => b.addEventListener('click', () => go(cur + +b.dataset.d)));
        go(0);
        carouselTurn = setInterval(() => {
            if (still.matches || document.hidden || stage.matches(':hover, :focus-within')) return;
            go(cur + 1);
        }, 3200);
    }

    async function refreshCarousel() {
        try {
            tracks = null;
            const list = await loadTracks();
            const key = list.map(t => t.played_at).join();
            if (key !== carouselKey) { carouselKey = key; buildCarousel(list); }
        } catch (e) {
            if (!carouselKey) recentBody.innerHTML = '<p class="rp-msg">Couldn\'t load songs right now. Try again in a minute.</p>';
        }
    }

    if (recentDlg) {
        document.getElementById('recent-open').addEventListener('click', () => {
            recentDlg.showModal();
            refreshCarousel();
            carouselPoll = setInterval(refreshCarousel, 60e3); // new songs show up while it's open
        });
        document.getElementById('recent-close').addEventListener('click', () => recentDlg.close());
        recentDlg.addEventListener('click', e => { if (e.target === recentDlg) recentDlg.close(); }); // click outside the box
        recentDlg.addEventListener('close', () => { clearInterval(carouselTurn); clearInterval(carouselPoll); carouselKey = ''; });
    }
})();
