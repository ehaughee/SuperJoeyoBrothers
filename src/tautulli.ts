// Tautulli API client + KV caching for movie stats
// Config from VITE_* env vars (set in .env for local, dashboard secrets for deploy)
// MOVIE_IDS format: comma-separated groups, pipe-separated IDs within a group
//   e.g. "83162,8789|63120" = two movies, second combines old+new rating keys

const config = {
    apiKey: import.meta.env.VITE_TAUTULLI_API_KEY,
    baseUrl: import.meta.env.VITE_TAUTULLI_BASE_URL,
    userId: import.meta.env.VITE_JOEY_USER_ID,
    movieGroups: (import.meta.env.VITE_MOVIE_IDS ?? '')
        .split(',')
        .map(g => g.split('|').map(s => s.trim()).filter(Boolean))
        .filter(g => g.length > 0),
} as const;

export const EDGE_CACHE_TTL = 60;  // browser/CDN cache for JSON API (seconds)
const CACHE_TTL = 900;              // KV cache TTL — 15 min keeps writes under 1k/day

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

/** Assemble MovieStats from cached (or fresh) Tautulli API responses.
 *  Each movieGroup is one or more rating_keys for the same film. */
export async function getCachedMovies(env: any): Promise<MovieStats[]> {
    const kv = env?.MOVIE_CACHE;
    const uId = Number(config.userId);

    return Promise.all(config.movieGroups.map(async (ids: string[]) => {
        const primaryId = ids[0];
        const allIds = ids;

        // Metadata: use primary ID
        const rawMeta = await cachedCall(kv, 'get_metadata', { rating_key: primaryId });
        const meta = rawMeta?.response?.data;

        // Activity: check all IDs
        const activity = await cachedCall(kv, 'get_activity');

        // Watch count: sum across all IDs
        let totalPlays = 0;
        for (const id of allIds) {
            const stats = await cachedCall(kv, 'get_item_user_stats', { rating_key: id });
            const userPlays = stats?.response?.data?.find((u: any) => u?.user_id === uId)?.total_plays ?? 0;
            totalPlays += Number(userPlays);
        }

        // Last watched: most recent date from any ID (user-filtered first, then unfiltered)
        let latestDate = 0;
        for (const id of allIds) {
            const hist = await cachedCall(kv, 'get_history', {
                rating_key: id, user_id: config.userId,
                length: '1', order_column: 'date', order_dir: 'desc',
            });
            const d = hist?.response?.data?.data?.[0]?.date ?? hist?.response?.data?.history?.[0]?.date;
            if (d > latestDate) latestDate = d;
        }
        // If user-filtered found nothing, try unfiltered across all IDs
        if (latestDate === 0) {
            for (const id of allIds) {
                const hist = await cachedCall(kv, 'get_history', {
                    rating_key: id, length: '1',
                    order_column: 'date', order_dir: 'desc',
                });
                const d = hist?.response?.data?.data?.[0]?.date ?? hist?.response?.data?.history?.[0]?.date;
                if (d > latestDate) latestDate = d;
            }
        }

        // Title: try metadata first, then history fallback
        let title = meta?.title ?? meta?.full_title;
        if (!title) {
            const histData = await cachedCall(kv, 'get_history', { rating_key: primaryId, length: '1' });
            const entry = histData?.response?.data?.data?.[0] ?? histData?.response?.data?.history?.[0];
            title = entry?.title ?? `Movie ${primaryId}`;
        }

        return {
            movieId: primaryId,
            title,
            watchCount: String(totalPlays),
            watching: activity?.response?.data?.sessions?.some(
                (s: any) => String(s?.user_id) === String(uId) && allIds.includes(String(s?.rating_key))
            ) ? 'Yes' : 'No',
            lastWatched: latestDate ? relativeTime(latestDate) : 'never',
        } satisfies MovieStats;
    }));
}
