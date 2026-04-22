let allChapters = {}; // Structure: { "Lektio 1": [words...], "Lektio 2": [words...] }
let currentDeck = [];
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    // Note: Change 'words.csv' to your new dedicated database filename if it's different
    fetch('words.csv')
        .then(response => response.text())
        .then(csvText => {
            const cleanData = csvText.replace(/^\uFEFF/, '');
            const rows = cleanData.split(/\r?\n/).filter(row => row.trim() !== "");
            
            let currentChapterName = "Unkategorisiert";
            
            rows.slice(1).forEach(row => {
                const cols = row.split(';');
                const col1 = cols[0] ? cols[0].trim() : "";
                const col2 = cols[1] ? cols[1].trim() : "";
                const col3 = cols[2] ? cols[2].trim() : "";

                // Detect Chapter Separator (e.g., "Lektio 1")
                if (col1.toLowerCase().includes("lektio")) {
                    currentChapterName = col1;
                    if (!allChapters[currentChapterName]) allChapters[currentChapterName] = [];
                } 
                // Regular Word
                else if (col1 !== "") {
                    if (!allChapters[currentChapterName]) allChapters[currentChapterName] = [];
                    allChapters[currentChapterName].push({
                        latin: col1,
                        german: col2,
                        mnemonic: col3
                    });
                }
            });

            renderMenu();
        });
});

function renderMenu() {
    const container = document.getElementById('chapter-buttons');
    container.innerHTML = "";
    
    Object.keys(allChapters).forEach(chapter => {
        const btn = document.createElement('button');
        btn.className = 'chapter-btn';
        btn.innerText = `${chapter} (${allChapters[chapter].length} Wörter)`;
        btn.onclick = () => startSession(chapter);
        container.appendChild(btn);
    });
}

function startSession(mode) {
    if (mode === 'all') {
        currentDeck = Object.values(allChapters).flat();
    } else {
        currentDeck = [...allChapters[mode]];
    }

    shuffle(currentDeck);
    currentIndex = 0;
    
    document.getElementById('menu-view').classList.add('hidden');
    document.getElementById('session-view').classList.remove('hidden');
    displayCard();
}

function displayCard() {
    if (currentDeck.length === 0) return;
    
    const card = currentDeck[currentIndex];
    document.getElementById('wordFront').innerText = card.latin;
    document.getElementById('wordBack').innerText = card.german;
    
    const mContainer = document.getElementById('merkhilfe-container');
    if (card.mnemonic) {
        mContainer.innerText = "Merkhilfe: " + card.mnemonic;
        mContainer.classList.remove('hidden');
    } else {
        mContainer.classList.add('hidden');
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
        return;
    }
    displayCard();
}

function handleBack() {
    if (!document.getElementById('session-view').classList.contains('hidden')) {
        document.getElementById('session-view').classList.add('hidden');
        document.getElementById('menu-view').classList.remove('hidden');
    } else {
        window.location.href = 'index.html';
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}