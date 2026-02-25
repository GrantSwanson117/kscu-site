async function fetchCurrentTrack() {
    // console.log("hello from fetchCurrentTrack()")
    try {
        let request = `https://kscuapi.org/tracks/current`
        let response = await fetch(request);
        if (response.status != 200) {
            throw new Error("Error: " + response.status)
        }

        let data = await response.json();

        try {
            store.remove("track_data")
            store.remove("recentTracks")
            store('track_data', data)
        }
        catch (error) {
            store('track_data', data)
            // console.log("Error: " + error)
        }
    }
    catch (error) {
        // console.log("Error: " + error)
        // wait a random time between 0.2-0.6 seconds and try again
        setTimeout(fetchCurrentTrack, Math.floor(Math.random() * 400) + 200)
    }
}
async function fetchRecentTracks() {
    // console.log("hello from fetchCurrentTrack()")
    try {
        let request = `https://kscuapi.org/tracks/recent`
        let response = await fetch(request);
        if (response.status != 200) {
            throw new Error("Error: " + response.status)
        }

        let recentData = await response.json();

        try {
            store.remove("recent_track_data")
            store.remove("recentTrackData")
            store('recent_track_data', recentData)
        }
        catch (error) {
            store('recent_track_data', recentData)
            // console.log("Error: " + error)
        }
    }
    catch (error) {
        // console.log("Error: " + error)
        // wait a random time between 0.2-0.6 seconds and try again
        setTimeout(fetchCurrentTrack, Math.floor(Math.random() * 400) + 200)
    }
}

async function placeSpins() {
    // console.log("hello from placeSpins()")
    let data;
    try {
        data = store.get("track_data");
    }
    catch (error) {
        await fetchCurrentTrack()
        data = store.get("track_data");
    }
    let recentData;
    try {
        recentData = store.get("recent_track_data");
    }
    catch (error) {
        await fetchCurrentTrack()
        recentData = store.get("recent_track_data");
    }
    const song = data["name"]
    const artist = data["artists"]
    document.getElementById("playing-song").innerHTML = DOMPurify.sanitize(`${song} - <em>${artist}</em>`, { ALLOWED_TAGS: ['em'] });
    if (window.location.pathname == '/') {
        for (let i = 0; i < 6; i++) {
            const track = recentData[i]; 
            const idNum = i + 1; // Maps 0-5 to IDs 1-6

            if (track) {
                // Now you can index through and access properties!
                document.getElementById(`playing-song-${idNum}`).textContent = track.name;
                document.getElementById(`playing-artist-${idNum}`).textContent = track.artists;
                document.getElementById(`year-${idNum}`).textContent = track.release_date || "";

                const imgElem = document.getElementById(`playing-image-${idNum}`);
                if (track.image) {
                    imgElem.src = track.image;
                    imgElem.onerror = function() { this.src = '/vinyl.svg'; };
                } else {
                    imgElem.src = "/vinyl.svg";
                }
            }
        }
    }

    if (typeof sound !== 'undefined' && sound.playing()) {
        const show_data = store.get("show_data");
        document.title = `${song} - ${artist}`;
        media_title = `${song} - ${artist}`;
        const cur_djs = data["dj-0"][0]["name"];

        media_artist = `${show_data["show_title"]} - ${cur_djs}`;
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                    title: media_title,
                    artist: media_artist,
                    artwork: [
                        { src: "/kscu-round-92.png", sizes: "92x92", type: "image/png" },
                        { src: "/kscu-round-128.png", sizes: "128x128", type: "image/png" },
                        { src: "/kscu-round-192.png", sizes: "192x192", type: "image/png" },
                        { src: "/kscu-round-256.png", sizes: "256x256", type: "image/png" },
                        { src: "/kscu-round-384.png", sizes: "384x384", type: "image/png" },
                        { src: "/kscu-round-512.png", sizes: "512x512", type: "image/png" },
                    ]
                });
        }
    }
}

async function updateTracks() {
    await fetchCurrentTrack();
    await fetchRecentTracks()
    await placeSpins();
}

placeSpins();
updateTracks();

// Open a SSE connection to the /streams/ endpoint
async function openSSE() {
    // console.log("Opening SSE connection...")
    let eventSource = new EventSource(`https://kscuapi.org/stream`);
    eventSource.addEventListener("trackUpdate", async (event) => {
        console.log("Track Update Event Detected!");
        console.log("New Song Data:", event.data); // This will be "song - artist"
        
        await updateTracks();
    });

    // Optional: Keep this to see the pings/comments for debugging
    eventSource.onmessage = function(event) {
        console.log("Generic message (data only):", event.data);
    };

    eventSource.onerror = function(err) {
        console.error("SSE Connection Error:", err);
    };
}

openSSE();