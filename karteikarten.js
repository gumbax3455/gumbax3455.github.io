let allChapters = {};
let currentDeck = [];
let currentDeckName = "all";
let currentIndex = 0;
let isSubmittingReview = false;

const API_BASE_URL = (window.API_BASE_URL || "").replace(/\/$/, "");
const STATUS_CLASS_BY_BUCKET = {
    new: "card-status-new",
    due: "card-status-due",
    mature: "card-status-mature"
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadCsvCards();
    await refreshDeckStatus();
    renderMenu();
    updateOverviewPanel("all");
});

async function loadCsvCards() {
    const response = await fetch("words.csv");
    const csvText = await response.text();

    if (csvText.trim().startsWith("<!DOCTYPE") || csvText.includes("404")) {
        document.getElementById("chapter-buttons").innerHTML =
            "<p style='color:red;'>FEHLER: 'words.csv' wurde auf dem Server nicht gefunden (404).<br>Pruefe, ob der Dateiname klein geschrieben ist!</p>";
        return;
    }

    const rows = parseCsv(csvText, ";");
    let currentChapterName = "Unbekannt";

    rows.forEach((cols, index) => {
        const col1 = (cols[0] || "").trim();
        const hasCardId = /^c\d{2}-\d{3}$/i.test(col1);

        const latin = (cols[hasCardId ? 1 : 0] || "").trim();
        const german = (cols[hasCardId ? 2 : 1] || "").trim();
        const mnemonic = (cols[hasCardId ? 3 : 2] || "").trim();
        const cardId = hasCardId ? col1 : `legacy-${index + 1}`;

        if (/^lekt(io|ion)/i.test(col1)) {
            currentChapterName = col1;
            if (!allChapters[currentChapterName]) allChapters[currentChapterName] = [];
            return;
        }

        if (latin === "" || german === "") return;
        if (!allChapters[currentChapterName]) allChapters[currentChapterName] = [];
        allChapters[currentChapterName].push({
            cardId,
            chapter: currentChapterName,
            latin,
            german,
            mnemonic,
            statusBucket: "new",
            state: "New",
            dueDate: null
        });
    });
}

async function refreshDeckStatus(deckName) {
    if (!API_BASE_URL) return;

    try {
        const url = new URL(`${API_BASE_URL}/deck-status`);
        if (deckName && deckName !== "all") {
            url.searchParams.set("deck", deckName);
        }
        const response = await fetch(url.toString());
        if (!response.ok) return;
        const payload = await response.json();
        const statusById = new Map((payload.cards || []).map(card => [card.card_id, card]));

        Object.values(allChapters).flat().forEach(card => {
            const serverCard = statusById.get(card.cardId);
            if (!serverCard) return;
            card.state = serverCard.state || card.state;
            card.dueDate = serverCard.due_date || null;
            card.statusBucket = serverCard.status_bucket || card.statusBucket;
        });
    } catch (_error) {
        // Keep local defaults when API is unavailable.
    }
}

function renderMenu() {
    const container = document.getElementById("chapter-buttons");
    container.innerHTML = "";

    Object.keys(allChapters).forEach(name => {
        const cards = allChapters[name];
        const stat = summarizeCards(cards);
        const btn = document.createElement("button");
        btn.className = "chapter-btn";
        btn.innerHTML = `<span>${name}</span> <span class="chapter-meta">Neu ${stat.newCards} | Faellig ${stat.dueCards} | Reif ${stat.matureCards}</span>`;
        btn.onclick = () => startSession(name);
        btn.onmouseenter = () => updateOverviewPanel(name);
        container.appendChild(btn);
    });
}

async function startSession(mode) {
    currentDeckName = mode;
    currentDeck = mode === "all" ? Object.values(allChapters).flat() : [...(allChapters[mode] || [])];
    await refreshDeckStatus(mode);

    currentDeck.sort((a, b) => bucketPriority(a.statusBucket) - bucketPriority(b.statusBucket));
    currentIndex = 0;
    document.getElementById("menu-view").classList.add("hidden");
    document.getElementById("session-view").classList.remove("hidden");
    displayCard();
}

function displayCard() {
    const card = currentDeck[currentIndex];
    if (!card) return;

    document.getElementById("wordFront").innerText = card.latin;
    document.getElementById("wordBack").innerText = card.german;
    document.getElementById("progress-label").innerText = `${currentIndex + 1}/${currentDeck.length}`;

    const mBox = document.getElementById("merkhilfe-container");
    if (card.mnemonic && card.mnemonic !== "-") {
        mBox.innerText = card.mnemonic;
        mBox.classList.remove("hidden");
    } else {
        mBox.classList.add("hidden");
    }

    const flashcard = document.getElementById("flashcard");
    flashcard.classList.remove("is-flipped", "card-status-new", "card-status-due", "card-status-mature");
    flashcard.classList.add(STATUS_CLASS_BY_BUCKET[card.statusBucket] || STATUS_CLASS_BY_BUCKET.new);

    document.getElementById("controls").classList.add("hidden");
}

function flipCard() {
    document.getElementById("flashcard").classList.add("is-flipped");
    document.getElementById("controls").classList.remove("hidden");
}

async function rateCard(rating) {
    if (isSubmittingReview || !currentDeck[currentIndex]) return;
    isSubmittingReview = true;

    const activeCard = currentDeck[currentIndex];
    try {
        if (API_BASE_URL) {
            const response = await fetch(`${API_BASE_URL}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    card_id: activeCard.cardId,
                    rating,
                    deck_name: activeCard.chapter
                })
            });
            if (response.ok) {
                const payload = await response.json();
                activeCard.state = payload.card.state;
                activeCard.dueDate = payload.card.due_date;
                activeCard.statusBucket = payload.card.status_bucket;
            }
        }
    } catch (_error) {
        // Offline fallback: continue locally without blocking session.
    } finally {
        isSubmittingReview = false;
    }

    currentIndex++;
    if (currentIndex >= currentDeck.length) {
        alert("Lektion beendet!");
        handleBack();
        return;
    }
    displayCard();
}

function handleBack() {
    if (!document.getElementById("session-view").classList.contains("hidden")) {
        document.getElementById("session-view").classList.add("hidden");
        document.getElementById("menu-view").classList.remove("hidden");
        updateOverviewPanel(currentDeckName);
        renderMenu();
    } else {
        window.location.href = "index.html";
    }
}

function summarizeCards(cards) {
    return cards.reduce((acc, card) => {
        if (card.statusBucket === "due") acc.dueCards += 1;
        else if (card.statusBucket === "mature") acc.matureCards += 1;
        else acc.newCards += 1;
        return acc;
    }, { newCards: 0, dueCards: 0, matureCards: 0 });
}

function updateOverviewPanel(deckName) {
    const cards = deckName === "all" ? Object.values(allChapters).flat() : (allChapters[deckName] || []);
    const stat = summarizeCards(cards);
    document.getElementById("overview-title").innerText = deckName === "all" ? "Alle Lektionen" : deckName;
    document.getElementById("overview-total").innerText = cards.length;
    document.getElementById("overview-new").innerText = stat.newCards;
    document.getElementById("overview-due").innerText = stat.dueCards;
    document.getElementById("overview-mature").innerText = stat.matureCards;
}

function bucketPriority(bucket) {
    if (bucket === "due") return 0;
    if (bucket === "new") return 1;
    return 2;
}