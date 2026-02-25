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

async function fetchCurrentShow() {
   // console.log("Fetching show...")
    try {
        let request = `https://kscuserver.duckdns.org/shows/current`
        let response = await fetch(request);
        if (response.status != 200) {
            throw new Error("Error: " + response.status)
        }
        let data = await response.json();
        try {
            store.remove("show_data")
            store.remove("showData")
            store('show_data', data)
        }
        catch (error) {
            store('show_data', data)
        //    console.log("Error: " + error)
        }
    }
    catch (error) {
        // console.log("Error: " + error)
        // wait a random time between 0.2-0.6 seconds and try again
        setTimeout(fetchCurrentTrack, Math.floor(Math.random() * 400) + 200)
    }
}
async function fetchNextShow() {
   // console.log("Fetching show...")
    try {
        let request = `https://kscuserver.duckdns.org/shows/next`
        let response = await fetch(request);
        if (response.status != 200) {
            throw new Error("Error: " + response.status)
        }
        let nextData = await response.json();
        try {
            store.remove("next_show_data")
            store.remove("nextShowData")
            store('next_show_data', nextData)
        }
        catch (error) {
            store('show_data', nextData)
        //    console.log("Error: " + error)
        }
    }
    catch (error) {
        // console.log("Error: " + error)
        // wait a random time between 0.2-0.6 seconds and try again
        setTimeout(fetchCurrentTrack, Math.floor(Math.random() * 400) + 200)
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
    /*document.getElementById("show_title").innerHTML = DOMPurify.sanitize(showTitle, { ALLOWED_TAGS: ['b', 'i', 'div'], ALLOWED_ATTR: ['style', 'id'] });
    document.getElementById("dj_name_inner_div").style.whiteSpace = "nowrap";*/
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

function placeImage(elem, imageUrl, category, start) {
    function placeSVG() {
        const categorySvg = {
            Automation: "Automation",
            Blues: "Blues",
            Country: "Country",
            Electronic: "Electronic",
            "Hip-Hop": "Hip-Hop",
            Indie: "Indie",
            Jazz: "Jazz",
            Pop: "Pop",
            Punk: "Punk",
            Rock: "Rock",
            Soul: "Soul",
            Sports: "Sports",
            Talk: "Talk",
            Disco: "Disco",
            Psychedelic: "Psychedelic",
            Folk: "Folk",
            "R&B": "R&B",
            Reggae: "Reggae",
            Metal: "Metal",
            "Special Event": "SpecialEvent",
        }[category] || `Other`;

        elem.style.minHeight = "75%";
        elem.style.minWidth = "75%";
        elem.style.maxWidth = "75%";
        elem.style.maxHeight = "75%";

        elem.src = `/genres/${categorySvg}.svg`;
    }
    var img = new Image();

    const regex = /spinitron\.com\/images\/Show/;

    if (!regex.test(imageUrl)) {
        placeSVG();
        return;
    }

    img.src = imageUrl;

    img.onload = function () {
        // Image is valid

        elem.style.minHeight = "100%";
        elem.style.minWidth = "100%";
        elem.style.maxWidth = "100%";
        elem.style.maxHeight = "100%";

        elem.src = imageUrl;
    }

    img.onerror = function () {
        placeSVG();
    }
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

async function placeShowDetails() {
    let data;
    try {
        data = store.get("show_data");
        if (!data) throw new Error("No data in store");
    } catch (error) {
        console.log("Fetching show data...");
        await fetchCurrentShow();
        data = store.get("show_data");
    }
    let nextData;
    try {
        nextData = store.get("next_show_data");
        if (!nextData) throw new Error("No data in store");
    } catch (error) {
        console.log("Fetching next show data...");
        await fetchNextShow();
        nextData = store.get("next_show_data");
    }

    const redDot = document.getElementById("live-now-circle");
    const playHeader = document.getElementById("live-play");
    const leftHeader = document.getElementById("left-header-box");
    const rightHeader = document.getElementById("right-header-box");

    redDot.style.display = "block";
    playHeader.innerHTML = "LIVE";
    leftHeader.innerHTML = "LIVE NOW";
    rightHeader.innerHTML = "NEXT UP ON KSCU";
     /*else {
        redDot.style.display = "none";
        playHeader.innerHTML = "NEXT UP";
        leftHeader.innerHTML = "NEXT UP ON KSCU";
        rightHeader.innerHTML = "AND AFTER THAT";
    }*/

    // 2. Render Left Box (Current/Primary Show)
    // Using destructuring for cleaner access
    const current = data; // or data.show_0 depending on your new schema
    
    document.getElementById("left-show").textContent = current['show_title'];
    document.getElementById("left-dj").innerHTML = DOMPurify.sanitize(`with <i>${current['dj_name']}`, { ALLOWED_TAGS: ['i'] });
    document.getElementById("left-time").textContent = `${current['day']} ${current['timeslot']}`;
    document.getElementById("left-genre").textContent = current.category;
    
    placeDesc(document.getElementById("left-description-div"), document.getElementById("left-description"), current.description);
    placeImage(document.getElementById("left-image"), current.image || current["show-0"]?.image, current.category, current.start);

    const next = nextData
    // 3. Render Right Box (Next Show)
    document.getElementById("right-show").textContent = next["show_title"];
    document.getElementById("right-dj").innerHTML = DOMPurify.sanitize(`with <i>${next['dj_name']}`, { ALLOWED_TAGS: ['i'] });
    document.getElementById("right-time").textContent = `${next['day']} ${next['timeslot']}`;
    document.getElementById("right-genre").textContent = next.category;
    
    placeDesc(document.getElementById("right-description-div"), document.getElementById("right-description"), next.description);
    placeImage(document.getElementById("right-image"), next.image, next.category, next.start);
}

async function updateShow() {
    // First fetch new data
    await fetchNextShow()
    await fetchCurrentShow()
    

    // Then place the new data
    placeShow()
    placeShowDetails();
}


// Always place show on page load
await placeShow()
await placeShowDetails();