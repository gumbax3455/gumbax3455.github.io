function getSavedTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeToggleUI(theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
}

function updateThemeToggleUI(theme) {
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(btn => {
        btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? 'In den Light Mode wechseln' : 'In den Dark Mode wechseln';
    });
}

// Apply immediately to prevent FOUC (Flash of Unstyled Content)
const initialTheme = getSavedTheme();
document.documentElement.setAttribute('data-theme', initialTheme);

document.addEventListener("DOMContentLoaded", () => {
    updateThemeToggleUI(initialTheme);
});

// Listen for OS preference changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    // Only auto-switch if user hasn't explicitly set a preference
    if (!localStorage.getItem('theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
    }
});
