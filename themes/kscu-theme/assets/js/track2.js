async function updateTracks() {
    try {
        const [currentRes, recentRes] = await Promise.all([
            fetch(`https://kscuapi.org/tracks/current`),
            fetch(`https://kscuapi.org/tracks/recent`)
        ]);

        if (!currentRes.ok || !recentRes.ok) throw new Error("API Error");

        const currentData = await currentRes.json();
        let recentData = await recentRes.json();

        if (recentData && !Array.isArray(recentData) && recentData.tracks) {
            recentData = recentData.tracks;
        }

        store('track_data', currentData);
        store('recent_track_data', recentData);

        await placeTracks(currentData, recentData);
        
    } catch (error) {
        console.error("Track fetch failed, retrying...", error);
        setTimeout(updateTracks, 2000);
    }
}

async function placeTracks(data, recentData) {
    data = data || store.get("track_data");
    recentData = recentData || store.get("recent_track_data");

    if (!data) {
        console.error("No current track data available");
        return;
    }

    const song = data.name || "Unknown Song";
    const artist = data.artists || "Unknown Artist";

    // Update main display
    const mainSong = document.getElementById("playing-song");
    if (mainSong) {
        mainSong.innerHTML = DOMPurify.sanitize(`${song} - <em>${artist}</em>`, { ALLOWED_TAGS: ['em'] });
    }

    // Update recent list
    if (window.location.pathname === '/' && Array.isArray(recentData)) {
        for (let i = 0; i < 6; i++) {
            const track = recentData[i]; 
            const idNum = i + 1;

            // Only update if the track exists AND the DOM elements exist
            const songElem = document.getElementById(`playing-song-${idNum}`);
            if (track && songElem) {
                songElem.textContent = track.name || "Unknown";
                document.getElementById(`playing-artist-${idNum}`).textContent = track.artists || "Unknown";
                document.getElementById(`year-${idNum}`).textContent = track.release_date || "";

                const imgElem = document.getElementById(`playing-image-${idNum}`);
                if (imgElem) {
                    imgElem.src = track.image || "/vinyl.svg";
                    imgElem.onerror = function() { this.src = '/vinyl.svg'; };
                }
            }
        }
    }

    if (typeof sound !== 'undefined' && sound.playing()) {
        const show_data = store.get("show_data") || { show_title: "KSCU" };
        document.title = `${song} - ${artist}`;
        
        //checking if dj-0 exists before accessing index 0
        let djName = "KSCU DJ";
        if (data["dj-0"] && data["dj-0"][0] && data["dj-0"][0].name) {
            djName = data["dj-0"][0].name;
        }

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song,
                artist: `${show_data.show_title} - ${djName}`,
                artwork: [
                    { src: "/kscu-round-512.png", sizes: "512x512", type: "image/png" }
                ]
            });
        }
    }
}

async function openSSE() {
    let eventSource = new EventSource(`https://kscuapi.org/stream`);
    eventSource.addEventListener("trackUpdate", async (event) => {
        console.log("Track Update Event Detected!");
        console.log("New Song Data:", event.data);
        
        await updateTracks();
    });

    eventSource.onmessage = function(event) {
        console.log("Generic message (data only):", event.data);
    };

    eventSource.onerror = function(err) {
        console.error("SSE Connection Error:", err);
    };
}

await updateTracks();

openSSE();