let dictionary = [];

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    
    // Load Data
    fetch('words.csv')
        .then(response => response.text())
        .then(data => {
            const rows = parseCsv(data, ';');

            dictionary = rows.map(columns => {
                const originalLatin = columns[0] ? columns[0].trim() : "";
                const german = columns[1] ? columns[1].trim() : "";
                return { 
                    displayLatin: originalLatin,
                    searchLatin: simplifyLatin(originalLatin),
                    german
                };
            }).filter(item => {
                if (!item.displayLatin || !item.german) return false;
                return !item.displayLatin.toLowerCase().includes('lektion');
            });

            document.getElementById('status').innerText = `${dictionary.length} words loaded.`;
        });

    // Attach Search Event
    searchInput.addEventListener('input', search);
    searchInput.addEventListener('focus', function() { this.select(); });
});

function simplifyLatin(text) {
    if (!text) return "";
    return text.toLowerCase()
        .replace(/ā/g, 'a').replace(/ē/g, 'e').replace(/ī/g, 'i')
        .replace(/ō/g, 'o').replace(/ū/g, 'u').replace(/ȳ/g, 'y')
        .trim();
}

function getLevenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

function search() {
    const query = simplifyLatin(document.getElementById('searchInput').value);
    const display = document.getElementById('result');
    
    if (query.length === 0) { display.innerHTML = ""; return; }
    if (query.length < 2) {
        display.innerHTML = "<small style='color:#999'>Bitte weiter tippen...</small>";
        return;
    }
    const results = dictionary.map(item => {
        let score = 0;
        const dist = getLevenshteinDistance(query, item.searchLatin);
        
        if (item.searchLatin === query) score = 100;
        else if (item.searchLatin.startsWith(query)) score = 80 - dist;
        else if (item.searchLatin.includes(query)) score = 60 - dist;
        else if (dist <= 2) score = 40 - dist;
        else score = 0;

        return { ...item, score };
    }).filter(item => item.score > 0);

    results.sort((a, b) => b.score - a.score);

        // ... inside your search() function ...
    if (results.length > 0) {
        display.innerHTML = results.slice(0, 15).map(match => `
            <div class="result-item">
                <span class="latin-display">${match.displayLatin}</span> 
                <span class="german-text">: ${match.german}</span>
                <span class="match-score">${match.score}%</span>
            </div>
        `).join('');
    } else {
        display.innerHTML = `<div class="no-results">Keine Treffer gefunden.</div>`;
    }
}