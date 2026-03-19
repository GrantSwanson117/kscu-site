async function loadSchedule() {
    const target = document.getElementById('schedule-target');
    
    try {
        const response = await fetch('https://kscuapi.org/schedule');
        const data = await response.json();
        
        target.innerHTML = '';

        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'schedule-item';
            div.innerHTML = `
                <strong>${item.time}</strong> - ${item.event}
                <p>${item.description}</p>
            `;
            target.appendChild(div);
        });
    } catch (error) {
        target.innerHTML = '<p>Failed to load schedule.</p>';
        console.error('Error fetching schedule:', error);
    }
}

loadSchedule();