function underlineLinksInParagraph(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const links = doc.getElementsByTagName("a");
    for (let j = 0; j < links.length; j++) {
        // Add class "link-style"
        links[j].classList.add("link-style");
    }
    return doc.documentElement.innerHTML;
}

function replaceBreaksAndParagraphsWithSpaces(text) {
    console.log(text);

    // let toReturn = text.replace(/<br\s*\/?>|<br\s*>\s*<\/br\s*>/gi, ' ').trim();
    // toReturn = toReturn.replace(/<p>|<\/p>/gi, ' ').trim();
    let toReturn = text.replace(/<br\s*\/?>|<br\s*>\s*<\/br\s*>|<p[^>]*>|<\/p>/gi, ' ').trim();
    return toReturn;
}

async function updateShowData() {
    try {
        const [currentRes, nextRes] = await Promise.all([
            fetch(`https://kscuapi.org/shows/current`),
            fetch(`https://kscuapi.org/shows/next`)
        ]);

        if (!currentRes.ok || !nextRes.ok) throw new Error("API issues");

        const currentData = await currentRes.json();
        const nextData = await nextRes.json();

        store('show_data', currentData);
        store('next_show_data', nextData);
        
        return { currentData, nextData };
    } catch (error) {
        console.error("Fetch failed, retrying...", error);
        setTimeout(updateShowData, 2000); 
    }
}

async function placeShow() {
    let data;
    let nextData;
    // try to fetch show data
    try {
        data = store.get("show_data");
    }
    catch (error) {
        console.log("Could not get show data from store")
        await fetchCurrentShow()
        data = store.get("show_data");
    }
    try{
        nextData = store.get("next_show_data")
    }
    catch(error) {
        await fetchNextShow()
        nextData = store.get("next_show_data")
    }
}

function placeDesc(parentElement, descriptionElement, descriptionText) {
    if (!descriptionText || descriptionText.trim() === "") {
        return;
    }

    descriptionText = replaceBreaksAndParagraphsWithSpaces(descriptionText);

    // Add quotes around the description if they don't already exist
    if (!/^".+"$/.test(descriptionText) && !/^“.+”$/.test(descriptionText)) {
        descriptionText = `“${descriptionText}”`;
    }

    // DOMPurify configuration object
    var config = {
        ALLOWED_TAGS: ['strong', 'em', 'ol', 'ul', 'li', 'br', 'a', 'p'],
        ALLOWED_ATTR: ['href', 'target'], // You can add more allowed attributes if needed
        ALLOW_STYLES: [],
        FORBID_ATTR: ['style']
    };

    // Sanitize the description
    descriptionText = DOMPurify.sanitize(descriptionText, config);

    descriptionText = underlineLinksInParagraph(descriptionText);

    descriptionElement.innerHTML = descriptionText;
    parentElement.style.display = "block";
}

function placeImage(elem) {
    elem.src = "/genres/Other.svg"; 

    elem.style.objectFit = "contain";
    elem.style.padding = "15%"; 

    elem.onerror = function() {
        console.error("Could not find the SVG at /static/genres/Other.svg");
        elem.style.backgroundColor = "#222"; 
        elem.onerror = null; 
    };
}

function fadeIn(element) {
    var opacity = 0;
    var timer = setInterval(function () {
        if (opacity >= 1) {
            clearInterval(timer);
        }
        element.style.opacity = opacity;
        element.style.filter = "alpha(opacity=" + opacity * 100 + ")";
        opacity += 0.1;
    }, 8);
}

function fadeOut(element) {
    var opacity = 1;
    var timer = setInterval(function () {
        if(opacity <= 0) {
            clearInterval(timer);
        }
        element.style.opacity = opacity;
        element.style.filter = "alpha(opacity=" + opacity * 100 + ")";
        opacity -= 0.1;
    }, 8);
}

async function placeShowDetails(overrideCurrent, overrideNext) {
    let data = overrideCurrent;
    let nextData = overrideNext;
if (!data) {
        try {
            data = store.get("show_data");
            if (!data) throw new Error("No data in store");
        } catch (error) {
            console.log("Fetching show data...");
            await fetchCurrentShow();
            data = store.get("show_data");
        }
    }
    if (!nextData) {
        try {
            nextData = store.get("next_show_data");
            if (!nextData) throw new Error("No data in store");
        } catch (error) {
            console.log("Fetching next show data...");
            await fetchNextShow();
            nextData = store.get("next_show_data");
        }
    }

    const redDot = document.getElementById("live-now-circle");
    const playHeader = document.getElementById("live-play");
    const leftHeader = document.getElementById("left-header-box");
    const rightHeader = document.getElementById("right-header-box");

    redDot.style.display = "block";
    playHeader.innerHTML = "LIVE";
    leftHeader.innerHTML = "LIVE NOW";
    rightHeader.innerHTML = "NEXT UP ON KSCU";
    
    const current = data; 
    let displayTime = "";
    const start = current['start_time'];
    if (current["timeslot"]) {
        displayTime = current["timeslot"];
    }
    else if (start) {
        displayTime = start
        current['day'] = ""
    }

    document.getElementById("left-show").textContent = current.title || current.show_title || "Unknown Show";
    document.getElementById("left-dj").innerHTML = DOMPurify.sanitize(`with ${current['dj_name']}`, { ALLOWED_TAGS: ['i'] });
    document.getElementById("left-time").textContent = `${current['day']} ${displayTime}`.trim();
    document.getElementById("left-genre").textContent = current.category;
    
    placeDesc(document.getElementById("left-description-div"), document.getElementById("left-description"), current.description);
    placeImage(document.getElementById("left-image"), current.image || current["show-0"]?.image, current.category, current.start);

    const next = nextData
    document.getElementById("right-show").textContent = next["show_title"];
    document.getElementById("right-dj").innerHTML = DOMPurify.sanitize(`with ${next['dj_name']}`, { ALLOWED_TAGS: ['i'] });
    document.getElementById("right-time").textContent = `${next['day']} ${next['timeslot']}`;
    document.getElementById("right-genre").textContent = next.category;
    
    placeDesc(document.getElementById("right-description-div"), document.getElementById("right-description"), next.description);
    placeImage(document.getElementById("right-image"), next.image, next.category, next.start);

    const target = document.getElementById("show_title");
    if (target) {
        target.innerHTML = `<b style="margin-right: 0.25rem; white-space: nowrap;">${current.show_title}</b> with ${current.dj_name}`;
    }
}

// Always place show on page load
await placeShow()
await placeShowDetails();

async function openSSE() {
    let eventSource = new EventSource(`https://kscuapi.org/stream`);
    eventSource.addEventListener("showUpdate", async (event) => {
    console.log("Show Update Event Detected!");
    
    const freshData = await updateShowData(); 
    
    await placeShowDetails(freshData.currentData, freshData.nextData); 
});

    eventSource.onmessage = function(event) {
        console.log("Generic message (data only):", event.data);
    };

    eventSource.onerror = function(err) {
        console.error("SSE Connection Error:", err);
    };
}

(async () => {
    await updateShowData();
    openSSE();
})();