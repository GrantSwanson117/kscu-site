async function fetchCurrentTrack() {
    // console.log("hello from fetchCurrentTrack()")
    try {
        let request = `https://kscuserver.duckdns.org/tracks/current/`
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
    const song = data["name"]
    const artist = data["artists"]
    document.getElementById("playing-song").innerHTML = DOMPurify.sanitize(`${song} - <em>${artist}</em>`, { ALLOWED_TAGS: ['em'] });
    const elems = ['spin-0', 'spin-1', 'spin-2', 'spin-3', 'spin-4', 'spin-5', 'spin-6', 'spin-7', 'spin-8', 'spin-9'];
    /*if (window.location.pathname == '/') {
        for (let i = 1; i < 7; i++) {
            j = elems[i];
            document.getElementById("playing-song-" + i).innerHTML = DOMPurify.sanitize(data[j]["name"], { ALLOWED_TAGS: [] });
            document.getElementById("playing-artist-" + i).innerHTML = DOMPurify.sanitize(data[j]["artists"], { ALLOWED_TAGS: [] })
            document.getElementById("year-" + i).innerHTML = DOMPurify.sanitize(data[j]["release_date"], { ALLOWED_TAGS: [] })
            if (data[j]["image"] != null) {
                document.getElementById("playing-image-" + i).onerror = "this.onerror=null;this.src='/vinyl.svg'";
                document.getElementById("playing-image-" + i).src = data[j]["image"]
            } else {
                document.getElementById("playing-image-" + i).src = "/vinyl.svg"
            }
        }
    }*/

    if (typeof sound !== 'undefined' && sound.playing()) {
        const show_data = store.get("show_data");
        document.title = `${song} - ${artist}`;
        media_title = `${song} - ${artist}`;
        const cur_djs = data["dj-0"][0]["name"];
        if (show_data["dj-0"].length > 1) {
            for (var i = 1; i < show_data["dj-0"].length; i++) {
                cur_djs += ", " + show_data["dj-0"][i]["name"];
            }
        }
        media_artist = `${show_data["show-0"].title} - ${cur_djs}`;
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
    await placeSpins();
}

placeSpins();
updateTracks();

// Open a SSE connection to the /streams/ endpoint
async function openSSE() {
    // console.log("Opening SSE connection...")
    let eventSource = new EventSource(`https://kscuserver.duckdns.org/stream`);
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