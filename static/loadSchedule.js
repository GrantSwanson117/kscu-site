const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const START_HOUR = 7;
const END_HOUR = 25;

function minToPercent(mins) {
    const total = (END_HOUR - START_HOUR) * 60;
    const offset = mins - START_HOUR * 60;
    return (offset / total) * 100;
}

function fmtTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
}

const PX_PER_MIN = 62.4 / 60;

function minToPx(mins) {
    const offset = mins - START_HOUR * 60;
    return offset * PX_PER_MIN;
}
async function loadSchedule() {
    const target = document.getElementById('schedule-target');
    try {
        const response = await fetch('https://kscuapi.org/schedule');
        const shows = await response.json();

        const merged = {};
        shows.forEach(show => {
            const key = `${show.day}-${show.start_time}-${show.show_title}`;
            if (merged[key]) {
                merged[key].dj_name += ` & ${show.dj_name}`;
            } else {
                merged[key] = { ...show };
            }
        });
        const dedupedShows = Object.values(merged);

        const grid = document.createElement('div');
        grid.className = 'schedule-grid';

        const timeCol = document.createElement('div');
        timeCol.className = 'schedule-times';

        const blankHeader = document.createElement('div');
        blankHeader.className = 'schedule-day-header';
        blankHeader.innerHTML = '&nbsp;';
        timeCol.appendChild(blankHeader);

        for (let h = START_HOUR; h <= END_HOUR - 1; h++) {
            const label = document.createElement('div');
            label.className = 'schedule-time-label';
            label.textContent = fmtTime((h+1) * 60);
            timeCol.appendChild(label);
        }
        grid.appendChild(timeCol);

        DAY_KEYS.forEach((dayKey, i) => {
            const col = document.createElement('div');
            col.className = 'schedule-day-col';

            const header = document.createElement('div');
            header.className = 'schedule-day-header';
            header.textContent = DAYS[i];
            col.appendChild(header);

            const blocks = document.createElement('div');
            blocks.className = 'schedule-day-blocks';

            const nextDayKey = DAY_KEYS[(i + 1) % 7];

            const dayShows = dedupedShows.filter(s => s.day.toLowerCase() === dayKey);

            const nextDayOverflow = dedupedShows
                .filter(s => s.day.toLowerCase() === nextDayKey && s.start_time < 60)
                .map(s => ({
                    ...s,
                    start_time: s.start_time + 24 * 60,
                    end_time: (s.end_time === 0 ? 24 * 60 : s.end_time) + 24 * 60
                }));

            [...dayShows, ...nextDayOverflow].forEach(show => {
                let start = show.start_time;
                let end = show.end_time === 0 ? 24 * 60 : show.end_time;

                if (end < start) end += 24 * 60;

                start = Math.max(start, START_HOUR * 60);
                end = Math.min(end, END_HOUR * 60);
                if (start >= END_HOUR * 60 || end <= START_HOUR * 60) return;

                const block = document.createElement('div');
                block.className = 'schedule-block';
                block.style.top = `${minToPx(start)}px`;
                const blockHeight = (end - start) * PX_PER_MIN;  // ← define it here
                block.style.height = `${blockHeight}px`;
                block.innerHTML = `
                    <span class="schedule-block-title">${show.show_title}</span>
                    ${blockHeight >= 32 ? `<span class="schedule-block-dj">${show.dj_name}</span>` : ''}
                    ${blockHeight >= 48 ? `<span class="schedule-block-time">${fmtTime(show.start_time)}–${fmtTime(show.end_time === 0 ? 24 * 60 : show.end_time)}</span>` : ''}
                `;
                const fontSize = blockHeight < 48 ? '8px' : blockHeight < 72 ? '9px' : '10px';
                block.style.fontSize = fontSize;
                blocks.appendChild(block);
            });

            col.appendChild(blocks);
            grid.appendChild(col);
        });

        target.innerHTML = '';
        target.appendChild(grid);
        function updateTimeLine() {
    const now = new Date();
    let currentMins = now.getHours() * 60 + now.getMinutes();
    if (currentMins < 60) currentMins += 24 * 60;

    if (currentMins < START_HOUR * 60 || currentMins >= END_HOUR * 60) return;

    const todayIndex = (now.getDay() + 6) % 7;

    const dayCols = document.querySelectorAll('.schedule-day-blocks');
    const todayCol = dayCols[todayIndex];
    if (!todayCol) return;

    let line = todayCol.querySelector('.time-line');
    if (!line) {
        line = document.createElement('div');
        line.className = 'time-line';
        todayCol.appendChild(line);
    }

    line.style.display = 'block';
    line.style.top = `${minToPx(currentMins)}px`;
}

updateTimeLine();
setInterval(updateTimeLine, 60000); // update every minute

    } catch (error) {
        target.innerHTML = '<p>Failed to load schedule.</p>';
        console.error('Error fetching schedule:', error);
    }
}

loadSchedule();