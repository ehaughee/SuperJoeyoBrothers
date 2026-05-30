// Fetches fresh movie stats and updates the page in place.
// The page already has server-rendered data; this just keeps it current.
(async () => {
    try {
        const res = await fetch('/api/movies');
        if (!res.ok) return;

        /** @type {Array<{movieId: string, title: string, watchCount: string, watching: string}>} */
        const movies = await res.json();
        for (const m of movies) {
            const card = document.querySelector(`[data-movie-id="${m.movieId}"]`);
            if (!card) continue;

            const title = card.querySelector('[data-role="title"]');
            const watching = card.querySelector('[data-role="watching"]');
            if (title) title.textContent = `Joey watched ${m.title} ${m.watchCount} times`;
            if (watching) watching.textContent = `Is he watching it right now? ${m.watching}`;
        }
    } catch (_) {
        // SSR already shows data; silently ignore fetch failures
    }
})();

