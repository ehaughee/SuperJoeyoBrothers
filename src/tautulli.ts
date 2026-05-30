// Tautulli API client + KV caching for movie stats
// All configuration comes from VITE_* env vars at build time

const config = {
    apiKey: import.meta.env.VITE_TAUTULLI_API_KEY,
    baseUrl: import.meta.env.VITE_TAUTULLI_BASE_URL,
    userId: import.meta.env.VITE_JOEY_USER_ID,
    movieIds: (import.meta.env.VITE_MOVIE_IDS ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
} as const;

export const MOVIE_IDS = config.movieIds;
const CACHE_TTL = 60; // seconds — keep short for near-live counts

/** Movie stats returned to the UI */
export interface MovieStats {
    movieId: string;
    title: string;
    watchCount: string;
    watching: string; // "Yes" | "No"
    lastWatched: string; // relative time, e.g. "2 hours ago"
}

// ── Tautulli API helpers ──────────────────────────────────────────

async function tautulli<T>(cmd: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(config.baseUrl);
    url.searchParams.set('apikey', config.apiKey);
    url.searchParams.set('cmd', cmd);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url.toString());
    return r.json() as T;
}

async function fetchTitle(movieId: string): Promise<string> {
    // Try metadata endpoint first
    const meta = await tautulli<any>('get_metadata', { rating_key: movieId });
    if (meta?.title || meta?.full_title) return meta.title || meta.full_title;

    // Fall back to history
    const history = await tautulli<any>('get_history', { rating_key: movieId, length: '100' });
    const items = history?.response?.data?.data ?? history?.response?.data?.history ?? [];
    if (Array.isArray(items)) {
        const found = items.find((item: any) => String(item.rating_key) === movieId);
        if (found?.title) return found.title;
    }
    return `Movie ${movieId}`;
}

async function fetchPlays(movieId: string): Promise<string> {
    const data = await tautulli<any>('get_item_user_stats', { rating_key: movieId });
    const rows = data?.response?.data;
    if (Array.isArray(rows)) {
        const user = rows.find((u: any) => u?.user_id == Number(config.userId));
        if (user) return user.total_plays ?? '0';
    }
    return '0';
}

async function fetchWatching(movieId: string): Promise<string> {
    const data = await tautulli<any>('get_activity');
    const sessions = data?.response?.data?.sessions;
    if (Array.isArray(sessions)) {
        const match = sessions.find(
            (s: any) => String(s?.user_id) === config.userId && String(s?.rating_key) === movieId
        );
        if (match) return 'Yes';
    }
    return 'No';
}

// Formats a unix-timestamp second as a relative string like "2 hours ago"
function relativeTime(unixTs: number): string {
    const diff = Math.floor(Date.now() / 1000) - unixTs;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
    return `${Math.floor(diff / 2592000)} months ago`;
}

async function fetchLastWatched(movieId: string): Promise<string> {
    const data = await tautulli<any>('get_history', {
        rating_key: movieId,
        user_id: config.userId,
        length: '1',
    });
    const items = data?.response?.data?.data ?? data?.response?.data?.history ?? [];
    if (Array.isArray(items) && items.length > 0) {
        return relativeTime(items[0].date);
    }
    return 'never';
}

async function fetchMovie(movieId: string): Promise<MovieStats> {
    const [title, watchCount, watching, lastWatched] = await Promise.all([
        fetchTitle(movieId),
        fetchPlays(movieId),
        fetchWatching(movieId),
        fetchLastWatched(movieId),
    ]);
    return { movieId, title, watchCount, watching, lastWatched };
}

// ── KV cache layer ────────────────────────────────────────────────

/** Get movie stats; uses KV cache when the MOVIE_CACHE binding is available */
export async function getMovie(movieId: string, env: any): Promise<MovieStats> {
    const key = `movie:${movieId}`;
    const kv = env?.MOVIE_CACHE;

    if (kv) {
        try {
            const cached = await kv.get(key);
            if (cached) { console.log(`[CACHE HIT] ${key}`); return JSON.parse(cached); }
            console.log(`[CACHE MISS] ${key}`);
        } catch (e) {
            console.error(`[KV ERROR] read ${key}`, e);
        }
    }

    const stats = await fetchMovie(movieId);
    console.log(`[FETCH] ${movieId} → ${stats.title} (${stats.watchCount} plays, watching: ${stats.watching}, last: ${stats.lastWatched})`);

    if (kv) {
        try {
            await kv.put(key, JSON.stringify(stats), { expirationTtl: CACHE_TTL });
            console.log(`[CACHE WRITE] ${key}`);
        } catch (e) {
            console.error(`[KV ERROR] write ${key}`, e);
        }
    }

    return stats;
}

/** Shared edge-cache TTL; used in response headers */
export const EDGE_CACHE_TTL = CACHE_TTL;
