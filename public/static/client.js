// Fetches fresh movie stats and updates the dynamic values in place.
// Static text ("Joey watched", "times", etc.) lives in the HTML — only the
// <span class="dv" data-field="..."> elements get replaced.
// Polls every 60s for fresh data.

/** @type {Array<{movieId: string, title: string, watchCount: string, watching: string, lastWatchedRelative: string, lastWatchedUnix: number}>} */
let lastMovies = [];

async function updateMovies() {
    try {
        const res = await fetch('/api/movies');
        if (!res.ok) return;
        lastMovies = await res.json();
        for (const m of lastMovies) {
            const card = document.querySelector(`[data-movie-id="${m.movieId}"]`);
            if (!card) continue;

            const title = card.querySelector('[data-field="title"]');
            const count = card.querySelector('[data-field="count"]');
            const watching = card.querySelector('[data-field="watching"]');
            const lastWatched = card.querySelector('[data-field="last-watched"]');
            if (title) title.textContent = m.title;
            if (count) count.textContent = m.watchCount;
            if (watching) watching.textContent = m.watching;
            if (lastWatched) {
                lastWatched.textContent = m.lastWatchedRelative;
                if (m.lastWatchedUnix) lastWatched.title = new Date(m.lastWatchedUnix * 1000).toLocaleString();
            }
        }
    } catch (err) {
        // SSR already shows data; silently ignore fetch failures
        console.error(`failed to fetch movies with error: ${err}`)
    }
}

updateMovies();
setInterval(updateMovies, 60000);

