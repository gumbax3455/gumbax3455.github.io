let allChapters = {}; 
let currentDeck = [];
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANT: GitHub is case-sensitive. Ensure your file is named exactly 'words.csv'
    fetch('words.csv')
        .then(response => response.text())
        .then(csvText => {
            // Error check: If it looks like HTML, it's probably a 404 page
            if (csvText.trim().startsWith("<!DOCTYPE") || csvText.includes("404")) {
                document.getElementById('chapter-buttons').innerHTML = 
                    "<p style='color:red;'>FEHLER: 'words.csv' wurde auf dem Server nicht gefunden (404).<br>Prüfe, ob der Dateiname klein geschrieben ist!</p>";
                return;
            }

            const rows = parseCsv(csvText, ';');
            
            let currentChapterName = "Unbekannt";
            
            rows.forEach(cols => {
                const col1 = (cols[0] || "").trim();
                const col2 = (cols[1] || "").trim();
                const col3 = (cols[2] || "").trim();

                // Detect Chapter (e.g. "Lektio 1")
                if (col1.toLowerCase().includes("lektio")) {
                    currentChapterName = col1;
                    if (!allChapters[currentChapterName]) allChapters[currentChapterName] = [];
                } 
                // Regular word: must have Latin (col1) and German (col2)
                else if (col1 !== "" && col2 !== "") {
                    if (!allChapters[currentChapterName]) allChapters[currentChapterName] = [];
                    allChapters[currentChapterName].push({
                        latin: col1,
                        german: col2,
                        mnemonic: col3 // This is your 3rd column
                    });
                }
            });

            renderMenu();
        });
});

function renderMenu() {
    const container = document.getElementById('chapter-buttons');
    container.innerHTML = "";
    
    Object.keys(allChapters).forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'chapter-btn';
        btn.innerHTML = `<span>${name}</span> <span style="opacity:0.4; font-size:0.8rem;">${allChapters[name].length} Karten</span>`;
        btn.onclick = () => startSession(name);
        container.appendChild(btn);
    });
}

function startSession(mode) {
    currentDeck = (mode === 'all') ? Object.values(allChapters).flat() : [...allChapters[mode]];
    shuffle(currentDeck);
    currentIndex = 0;
    document.getElementById('menu-view').classList.add('hidden');
    document.getElementById('session-view').classList.remove('hidden');
    displayCard();
}

function displayCard() {
    const card = currentDeck[currentIndex];
    document.getElementById('wordFront').innerText = card.latin;
    document.getElementById('wordBack').innerText = card.german;
    
    const mBox = document.getElementById('merkhilfe-container');
    if (card.mnemonic && card.mnemonic !== "-") {
        mBox.innerText = card.mnemonic;
        mBox.classList.remove('hidden');
    } else {
        mBox.classList.add('hidden');
    }
    
    document.getElementById('flashcard').classList.remove('is-flipped');
    document.getElementById('controls').classList.add('hidden');
}

function flipCard() {
    document.getElementById('flashcard').classList.add('is-flipped');
    document.getElementById('controls').classList.remove('hidden');
}

function nextCard() {
    currentIndex++;
    if (currentIndex >= currentDeck.length) {
        alert("Lektion beendet!");
        handleBack();
    } else {
        displayCard();
    }
}

function handleBack() {
    if (!document.getElementById('session-view').classList.contains('hidden')) {
        document.getElementById('session-view').classList.add('hidden');
        document.getElementById('menu-view').classList.remove('hidden');
    } else {
        window.location.href = 'index.html';
    }
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
}