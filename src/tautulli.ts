// Tautulli API client + KV caching for movie stats
// Config from VITE_* env vars (set in .env for local, dashboard secrets for deploy)

const config = {
    apiKey: import.meta.env.VITE_TAUTULLI_API_KEY,
    baseUrl: import.meta.env.VITE_TAUTULLI_BASE_URL,
    userId: import.meta.env.VITE_JOEY_USER_ID,
    movieIds: (import.meta.env.VITE_MOVIE_IDS ?? '')
        .split(',').map((s: string) => s.trim()).filter(Boolean),
} as const;

export const EDGE_CACHE_TTL = 60;
const CACHE_TTL = 60;

/** Fields we care about from the Tautulli API */
export interface MovieStats {
    movieId: string;
    title: string;
    watchCount: string;
    watching: string;
    lastWatched: string;
}

// ── Raw Tautulli API call ─────────────────────────────────────────

async function call(cmd: string, params: Record<string, string> = {}) {
    const url = new URL(config.baseUrl);
    url.searchParams.set('apikey', config.apiKey);
    url.searchParams.set('cmd', cmd);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return fetch(url.toString()).then(r => r.json()) as any;
}

/** Same as call() but caches the raw response in KV keyed by cmd+params */
async function cachedCall(kv: any, cmd: string, params: Record<string, string> = {}) {
    const key = 'tautulli:' + cmd + ':' +
        Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join(':');

    if (kv) {
        try {
            const cached = await kv.get(key);
            if (cached) { console.log(`[CACHE HIT] ${key}`); return JSON.parse(cached); }
            console.log(`[CACHE MISS] ${key}`);
        } catch { /* fall through */ }
    }

    const data = await call(cmd, params);

    if (kv) {
        try { await kv.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL }); } catch { }
    }

    return data;
}

function relativeTime(ts: number) {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
    return `${Math.floor(s / 2592000)}mo ago`;
}

/** Assemble MovieStats from cached (or fresh) Tautulli API responses */
export async function getCachedMovies(env: any): Promise<MovieStats[]> {
    const kv = env?.MOVIE_CACHE;

    return Promise.all(config.movieIds.map(async (id: string) => {
        const [rawMeta, stats, activity, history] = await Promise.all([
            cachedCall(kv, 'get_metadata', { rating_key: id }),
            cachedCall(kv, 'get_item_user_stats', { rating_key: id }),
            cachedCall(kv, 'get_activity'),
            cachedCall(kv, 'get_history', { rating_key: id, user_id: config.userId, length: '1' }),
        ]);

        const meta = rawMeta?.response?.data;
        const uId = Number(config.userId);

        // Title: try metadata first, then history (any user), fall back to ID
        let title = meta?.title ?? meta?.full_title;
        if (!title) {
            const histData = await cachedCall(kv, 'get_history', { rating_key: id, length: '1' });
            const entry = histData?.response?.data?.data?.[0] ?? histData?.response?.data?.history?.[0];
            title = entry?.title ?? `Movie ${id}`;
        }

        return {
            movieId: id,
            title,
            watchCount: String(stats?.response?.data?.find((u: any) => u?.user_id === uId)?.total_plays ?? '0'),
            watching: activity?.response?.data?.sessions?.some(
                (s: any) => String(s?.user_id) === String(uId) && String(s?.rating_key) === id
            ) ? 'Yes' : 'No',
            lastWatched: relativeTime(
                (history?.response?.data?.data?.[0] ?? history?.response?.data?.history?.[0])?.date ?? 0
            ),
        } satisfies MovieStats;
    }));
}
