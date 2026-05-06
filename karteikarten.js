let allChapters = {};
let currentDeck = [];
let currentDeckName = "all";
let selectedOverviewDeckName = "";
let currentIndex = 0;
let isSubmittingReview = false;

const API_BASE_URL = "https://latin-backend-myrk.onrender.com";
const STATUS_CLASS_BY_BUCKET = {
    new: "card-status-new",
    due: "card-status-due",
    mature: "card-status-mature"
};
const DASHBOARD_LEVEL_ORDER = ["NEU", 6, 5, 4, 3, 2, 1];
const DASHBOARD_COLOR_BY_KEY = {
    neu: "deck-level-neu",
    grade6: "deck-level-6",
    grade5: "deck-level-5",
    grade4: "deck-level-4",
    grade3: "deck-level-3",
    grade2: "deck-level-2",
    grade1: "deck-level-1"
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadCsvCards();
    await refreshDeckStatus();
    renderMenu();
    updateOverviewPanel("all");

    const deckSearchInput = document.getElementById("deck-search-input");
    if (deckSearchInput) {
        deckSearchInput.addEventListener("input", () => {
            const cards = allChapters[selectedOverviewDeckName] || [];
            renderDeckOverviewRows(cards, deckSearchInput.value);
        });
    }
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
            state: 0,
            stability: 0,
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
            card.state = Number.isInteger(serverCard.state) ? serverCard.state : Number(serverCard.state);
            if (Number.isNaN(card.state)) card.state = 0;
            card.stability = Number(serverCard.stability);
            if (Number.isNaN(card.stability)) card.stability = 0;
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
        btn.onclick = () => openDeckOverview(name);
        btn.onmouseenter = () => updateOverviewPanel(name);
        container.appendChild(btn);
    });
}

async function openDeckOverview(deckName) {
    selectedOverviewDeckName = deckName;
    currentDeckName = deckName;

    await refreshDeckStatus(deckName);

    const navTitle = document.getElementById("nav-title");
    if (navTitle) navTitle.innerText = `Latein ${deckName}`;

    const deckSearchInput = document.getElementById("deck-search-input");
    if (deckSearchInput) deckSearchInput.value = "";

    renderDeckOverviewRows(allChapters[deckName] || []);

    document.getElementById("menu-view").classList.add("hidden");
    document.getElementById("session-view").classList.add("hidden");
    document.getElementById("deck-overview-view").classList.remove("hidden");
}

function closeDeckOverview() {
    document.getElementById("deck-overview-view").classList.add("hidden");
    document.getElementById("session-view").classList.add("hidden");
    document.getElementById("menu-view").classList.remove("hidden");
    const navTitle = document.getElementById("nav-title");
    if (navTitle) navTitle.innerText = "Latein Lektionen";
    updateOverviewPanel(selectedOverviewDeckName || "all");
    renderMenu();
}

function startLearningFromOverview() {
    if (!selectedOverviewDeckName) return;
    startSession(selectedOverviewDeckName);
}

async function startSession(mode) {
    currentDeckName = mode;
    currentDeck = mode === "all" ? Object.values(allChapters).flat() : [...(allChapters[mode] || [])];
    await refreshDeckStatus(mode);

    currentDeck.sort((a, b) => bucketPriority(a.statusBucket) - bucketPriority(b.statusBucket));
    currentIndex = 0;
    document.getElementById("menu-view").classList.add("hidden");
    document.getElementById("deck-overview-view").classList.add("hidden");
    document.getElementById("session-view").classList.remove("hidden");
    const navTitle = document.getElementById("nav-title");
    if (navTitle) navTitle.innerText = `Latein ${mode}`;
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
                activeCard.stability = Number(payload.card.stability);
                if (Number.isNaN(activeCard.stability)) activeCard.stability = 0;
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
        if (currentDeckName !== "all" && selectedOverviewDeckName) {
            document.getElementById("deck-overview-view").classList.remove("hidden");
            const cards = allChapters[selectedOverviewDeckName] || [];
            const searchTerm = document.getElementById("deck-search-input")?.value || "";
            renderDeckOverviewRows(cards, searchTerm);
        } else {
            document.getElementById("menu-view").classList.remove("hidden");
            updateOverviewPanel(currentDeckName);
            renderMenu();
        }
    } else if (!document.getElementById("deck-overview-view").classList.contains("hidden")) {
        closeDeckOverview();
    } else {
        window.location.href = "index.html";
    }
}

function renderDeckOverviewRows(cards, rawQuery = "") {
    const list = document.getElementById("deck-card-list");
    if (!list) return;
    const count = document.getElementById("deck-card-count");

    const query = rawQuery.trim().toLowerCase();
    const filtered = cards.filter(card => {
        if (!query) return true;
        return card.latin.toLowerCase().includes(query) || card.german.toLowerCase().includes(query);
    });
    if (count) count.innerText = `${filtered.length}/${cards.length}`;

    list.innerHTML = "";
    renderDashboardAnalytics(cards);

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "deck-card-empty";
        empty.innerText = "Keine Karten gefunden.";
        list.appendChild(empty);
        return;
    }

    filtered.forEach(card => {
        const mapped = calculateUILevel(card);
        const cardNode = document.createElement("div");
        cardNode.className = `deck-gallery-card ${DASHBOARD_COLOR_BY_KEY[mapped.colorKey]}`;

        const levelTag = document.createElement("span");
        levelTag.className = "deck-level-tag";
        levelTag.innerText = String(mapped.label);

        const latin = document.createElement("div");
        latin.className = "deck-gallery-latin";
        latin.innerText = card.latin;

        cardNode.appendChild(levelTag);
        cardNode.appendChild(latin);
        list.appendChild(cardNode);
    });
}

function renderDashboardAnalytics(cards) {
    const totals = { NEU: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    cards.forEach(card => {
        const mapped = calculateUILevel(card);
        totals[mapped.label] = (totals[mapped.label] || 0) + 1;
    });

    const totalCards = cards.length || 1;
    const masteredCount = totals[1] || 0;
    const masteryPct = Math.round((masteredCount / totalCards) * 100);
    const note = cards.length ? (6 - masteryPct * 0.05).toFixed(1) : "-";
    const gradeValue = document.getElementById("grade-value");
    const gradeCaption = document.getElementById("grade-caption");
    if (gradeValue) gradeValue.innerText = note;
    if (gradeCaption) gradeCaption.innerText = `${masteryPct}% beherrscht`;

    const bars = document.getElementById("srs-bars");
    if (bars) {
        const maxCount = Math.max(...DASHBOARD_LEVEL_ORDER.map(level => totals[level] || 0), 1);
        bars.innerHTML = "";
        DASHBOARD_LEVEL_ORDER.forEach(level => {
            const amount = totals[level] || 0;
            const item = document.createElement("div");
            item.className = "srs-bar-item";

            const label = document.createElement("span");
            label.className = "srs-bar-label";
            label.innerText = String(level);

            const track = document.createElement("div");
            track.className = "srs-bar-track";

            const bar = document.createElement("div");
            const mappedClass = DASHBOARD_COLOR_BY_KEY[getColorKeyForLevel(level)];
            bar.className = `srs-bar ${mappedClass}`;

            const pct = Math.round((amount / maxCount) * 100);
            bar.style.width = amount === 0 ? "0%" : `${Math.max(8, pct)}%`;

            const value = document.createElement("span");
            value.className = "srs-bar-value";
            value.innerText = String(amount);

            track.appendChild(bar);
            item.appendChild(label);
            item.appendChild(track);
            item.appendChild(value);
            bars.appendChild(item);
        });
    }
}

function calculateUILevel(card) {
    if (!card) return { label: "NEU", colorKey: "neu" };
    const state = Number.isInteger(card.state) ? card.state : Number(card.state);
    if (state === 0) return { label: "NEU", colorKey: "neu" };
    if (state === 1 || state === 3) return { label: 6, colorKey: "grade6" };

    if (state === 2) {
        const stability = Number(card.stability);
        if (!Number.isNaN(stability)) {
            if (stability >= 30) return { label: 1, colorKey: "grade1" };
            if (stability >= 15) return { label: 2, colorKey: "grade2" };
            if (stability >= 7) return { label: 3, colorKey: "grade3" };
            if (stability >= 3) return { label: 4, colorKey: "grade4" };
            return { label: 5, colorKey: "grade5" };
        }
        return { label: 5, colorKey: "grade5" };
    }

    return { label: "NEU", colorKey: "neu" };
}

function getColorKeyForLevel(level) {
    if (level === "NEU") return "neu";
    if (level === 1) return "grade1";
    if (level === 2) return "grade2";
    if (level === 3) return "grade3";
    if (level === 4) return "grade4";
    if (level === 5) return "grade5";
    return "grade6";
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