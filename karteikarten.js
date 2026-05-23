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
const DASHBOARD_COLOR_BY_KEY = {
    neu: "deck-level-neu",
    grade6: "deck-level-6",
    grade5: "deck-level-5",
    grade4: "deck-level-4",
    grade3: "deck-level-3",
    grade2: "deck-level-2",
    grade1: "deck-level-1"
};

const DASHBOARD_LEVEL_ORDER = ["NEU", 6, 5, 4, 3, 2, 1];

document.addEventListener("DOMContentLoaded", async () => {
    await loadCsvCards();
    await refreshDeckStatus();
    
    renderDeckOverview();
    renderOmniGrid();
    
    const searchInput = document.getElementById("global-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", renderGlobalSearch);
    }

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
        document.getElementById("deck-list-container").innerHTML =
            "<p style='color:red;'>FEHLER: 'words.csv' wurde auf dem Server nicht gefunden (404).</p>";
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
            dueDate: null,
            lastReview: null
        });
    });
}

async function refreshDeckStatus() {
    if (!API_BASE_URL) return;

    try {
        const url = new URL(`${API_BASE_URL}/deck-status`);
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
            card.lastReview = serverCard.last_review || null;
            card.statusBucket = serverCard.status_bucket || card.statusBucket;
        });
    } catch (_error) {
        // Keep local defaults when API is unavailable.
    }
}

// UI Rendering Functions
function switchTab(tabId, element) {
    const tabs = document.querySelectorAll('.tabs-nav li');
    tabs.forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');

    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(panel => panel.classList.remove('active-panel'));
    document.getElementById(tabId).classList.add('active-panel');

    if (tabId === 'tab-search') {
        renderGlobalSearch();
    }
}

function getDeckMasteryPercentage(cards) {
    if (!cards || cards.length === 0) return 0;
    let totalScore = 0;
    cards.forEach(card => {
        const level = calculateUILevel(card).label;
        if (level === 1) totalScore += 100;
        else if (level === 2) totalScore += 80;
        else if (level === 3) totalScore += 60;
        else if (level === 4) totalScore += 40;
        else if (level === 5) totalScore += 20;
        else if (level === 6) totalScore += 10;
        // NEU = 0
    });
    return Math.round(totalScore / cards.length);
}

function getDaysSinceLastReview(cards) {
    let mostRecentDate = null;
    cards.forEach(card => {
        if (card.lastReview) {
            const date = new Date(card.lastReview);
            if (!mostRecentDate || date > mostRecentDate) {
                mostRecentDate = date;
            }
        }
    });
    if (!mostRecentDate) return "N/A";
    const diffTime = Math.abs(new Date() - mostRecentDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function renderDeckOverview() {
    const container = document.getElementById("deck-list-container");
    if (!container) return;
    container.innerHTML = "";

    Object.keys(allChapters).forEach(name => {
        const cards = allChapters[name];
        const mastery = getDeckMasteryPercentage(cards);
        const daysSince = getDaysSinceLastReview(cards);
        
        const item = document.createElement("div");
        item.className = "deck-list-item";
        item.onclick = () => openDeckOverview(name);
        item.innerHTML = `
            <div class="deck-name">${name}</div>
            <div class="deck-stat">
                <span class="deck-stat-label">Karten</span>
                <span class="deck-stat-val">${cards.length}</span>
            </div>
            <div class="deck-stat">
                <span class="deck-stat-label">Tage (letzte Wdh)</span>
                <span class="deck-stat-val">${daysSince}</span>
            </div>
            <div class="deck-stat">
                <span class="deck-stat-label">Beherrscht</span>
                <span class="deck-stat-val">${mastery}%</span>
            </div>
            <button class="deck-action-btn">Lernen</button>
        `;
        container.appendChild(item);
    });
}

function renderOmniGrid() {
    const grid = document.getElementById("omni-deck-grid");
    if (!grid) return;
    grid.innerHTML = "";

    Object.keys(allChapters).forEach(name => {
        const label = document.createElement("label");
        label.className = "checkbox-item";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = name;
        checkbox.onchange = updateOmniStartButton;
        
        const text = document.createTextNode(" " + name);
        
        label.appendChild(checkbox);
        label.appendChild(text);
        grid.appendChild(label);
    });
}

function updateOmniStartButton() {
    const checkboxes = document.querySelectorAll("#omni-deck-grid input[type='checkbox']:checked");
    const btn = document.getElementById("omni-start-btn");
    if (!btn) return;
    btn.disabled = checkboxes.length === 0;
    btn.innerText = `Start (${checkboxes.length})`;
}

function startOmnireview() {
    const checkboxes = document.querySelectorAll("#omni-deck-grid input[type='checkbox']:checked");
    const selectedDecks = Array.from(checkboxes).map(cb => cb.value);
    if (selectedDecks.length > 0) {
        startSession(selectedDecks);
    }
}

function renderGlobalSearch() {
    const list = document.getElementById("global-search-results");
    if (!list) return;
    const input = document.getElementById("global-search-input");
    const rawQuery = input ? input.value : "";
    
    const allCards = Object.values(allChapters).flat();
    const query = rawQuery.trim().toLowerCase();
    
    const filtered = allCards.filter(card => {
        if (!query) return true;
        return card.latin.toLowerCase().includes(query) || card.german.toLowerCase().includes(query);
    });

    list.innerHTML = "";

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "deck-card-empty";
        empty.innerText = "Keine Karten gefunden.";
        empty.style.width = "100%";
        list.appendChild(empty);
        return;
    }

    // Limit search results to 100 to avoid DOM lag
    filtered.slice(0, 100).forEach(card => {
        const mapped = calculateUILevel(card);
        const cardNode = document.createElement("div");
        cardNode.className = `deck-gallery-card ${DASHBOARD_COLOR_BY_KEY[mapped.colorKey]}`;
        cardNode.style.cursor = "pointer";

        const levelTag = document.createElement("span");
        levelTag.className = "deck-level-tag";
        levelTag.innerText = String(mapped.label);

        const textNode = document.createElement("div");
        textNode.className = "deck-gallery-latin";
        textNode.innerText = card.latin;

        cardNode.onclick = () => {
            if (textNode.innerText === card.latin) {
                textNode.innerText = card.german;
            } else {
                textNode.innerText = card.latin;
            }
        };

        cardNode.appendChild(levelTag);
        cardNode.appendChild(textNode);
        list.appendChild(cardNode);
    });
}

// Detailed Deck Overview Logic
async function openDeckOverview(deckName) {
    selectedOverviewDeckName = deckName;
    
    document.getElementById("main-tabs-container").classList.add("hidden");
    document.getElementById("menu-view").classList.add("hidden");
    document.getElementById("session-view").classList.add("hidden");
    
    document.getElementById("deck-overview-view").classList.remove("hidden");
    
    const navTitle = document.getElementById("nav-title");
    if (navTitle) {
        navTitle.innerText = `Latein ${deckName}`;
        navTitle.classList.remove("hidden");
    }

    const deckSearchInput = document.getElementById("deck-search-input");
    if (deckSearchInput) deckSearchInput.value = "";

    const cards = allChapters[deckName] || [];
    renderDeckOverviewRows(cards);
}

function closeDeckOverview() {
    document.getElementById("deck-overview-view").classList.add("hidden");
    
    document.getElementById("main-tabs-container").classList.remove("hidden");
    document.getElementById("nav-title").classList.add("hidden");
    document.getElementById("menu-view").classList.remove("hidden");
    
    const overviewTab = document.querySelector('.tabs-nav li');
    if (overviewTab) switchTab('tab-overview', overviewTab);
}

function startLearningFromOverview() {
    if (!selectedOverviewDeckName) return;
    startSession([selectedOverviewDeckName]);
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
        cardNode.style.cursor = "pointer";

        const levelTag = document.createElement("span");
        levelTag.className = "deck-level-tag";
        levelTag.innerText = String(mapped.label);

        const textNode = document.createElement("div");
        textNode.className = "deck-gallery-latin";
        textNode.innerText = card.latin;

        cardNode.onclick = () => {
            if (textNode.innerText === card.latin) {
                textNode.innerText = card.german;
            } else {
                textNode.innerText = card.latin;
            }
        };

        cardNode.appendChild(levelTag);
        cardNode.appendChild(textNode);
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
    const masteryPct = getDeckMasteryPercentage(cards);
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


// Session Logic
async function startSession(deckArray) {
    if (!Array.isArray(deckArray)) deckArray = [deckArray];
    currentDeckName = deckArray.length > 1 ? "Omnireview" : deckArray[0];
    
    currentDeck = [];
    deckArray.forEach(deck => {
        if (allChapters[deck]) {
            currentDeck.push(...allChapters[deck]);
        }
    });

    await refreshDeckStatus();

    // 1. Shuffle everything randomly first
    currentDeck.sort(() => Math.random() - 0.5);

    // 2. Then sort by SRS priority (Due -> New -> Mature)
    currentDeck.sort((a, b) => bucketPriority(a.statusBucket) - bucketPriority(b.statusBucket));

    currentIndex = 0;
    document.getElementById("menu-view").classList.add("hidden");
    document.getElementById("deck-overview-view").classList.add("hidden");
    document.getElementById("session-view").classList.remove("hidden");
    
    document.getElementById("main-tabs-container").classList.add("hidden");
    const navTitle = document.getElementById("nav-title");
    navTitle.innerText = `Latein ${currentDeckName}`;
    navTitle.classList.remove("hidden");
    
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
        // Offline fallback
    } finally {
        isSubmittingReview = false;
    }

    currentIndex++;
    if (currentIndex >= currentDeck.length) {
        alert("Session beendet!");
        handleBack();
        return;
    }
    displayCard();
}

function handleBack() {
    if (!document.getElementById("session-view").classList.contains("hidden")) {
        // Quit session
        document.getElementById("session-view").classList.add("hidden");
        
        if (currentDeckName !== "Omnireview" && selectedOverviewDeckName) {
            document.getElementById("deck-overview-view").classList.remove("hidden");
            const cards = allChapters[selectedOverviewDeckName] || [];
            const searchTerm = document.getElementById("deck-search-input")?.value || "";
            renderDeckOverviewRows(cards, searchTerm);
            document.getElementById("nav-title").innerText = `Latein ${selectedOverviewDeckName}`;
        } else {
            document.getElementById("menu-view").classList.remove("hidden");
            document.getElementById("main-tabs-container").classList.remove("hidden");
            document.getElementById("nav-title").classList.add("hidden");
        }
        
        // Refresh overview with new stats
        renderDeckOverview();
    } else if (!document.getElementById("deck-overview-view").classList.contains("hidden")) {
        closeDeckOverview();
    } else {
        // Return to dictionary hub
        window.location.href = "index.html";
    }
}

// Helpers
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

function bucketPriority(bucket) {
    if (bucket === "due") return 0;
    if (bucket === "new") return 1;
    return 2;
}