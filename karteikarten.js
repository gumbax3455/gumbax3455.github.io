let words = [];
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    fetch('words.csv')
        .then(response => response.text())
        .then(csvText => {
            const cleanData = csvText.replace(/^\uFEFF/, '');
            const rows = cleanData.split(/\r?\n/).filter(row => row.trim() !== "");
            
            // Map the CSV into an array of objects
            words = rows.slice(1).map(row => {
                const cols = row.split(';');
                return { 
                    latin: cols[0] ? cols[0].trim() : "", 
                    german: cols[1] ? cols[1].trim() : "" 
                };
            }).filter(w => w.latin !== "");

            shuffle(words);
            displayCard();
        });
});

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function displayCard() {
    if (words.length === 0) return;
    
    const card = words[currentIndex];
    document.getElementById('wordFront').innerText = card.latin;
    document.getElementById('wordBack').innerText = card.german;
    
    // Reset card state
    document.getElementById('flashcard').classList.remove('is-flipped');
    document.getElementById('controls').classList.add('hidden');
}

function flipCard() {
    const card = document.getElementById('flashcard');
    card.classList.add('is-flipped');
    // Show controls immediately
    document.getElementById('controls').classList.remove('hidden');
}

function nextCard() {
    currentIndex++;
    if (currentIndex >= words.length) {
        shuffle(words); // Reshuffle when finished
        currentIndex = 0;
    }
    displayCard();
}