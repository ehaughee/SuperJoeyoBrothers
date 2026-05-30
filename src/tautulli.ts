// Tautulli API client + KV caching for movie stats
// Config from VITE_* env vars (set in .env for local, dashboard secrets for deploy)
// MOVIE_IDS format: comma-separated groups, pipe-separated IDs within a group
//   e.g. "83162,8789|63120" = two movies, second combines old+new rating keys

import { logger } from './logger';

const config = {
    apiKey: import.meta.env.VITE_TAUTULLI_API_KEY,
    baseUrl: import.meta.env.VITE_TAUTULLI_BASE_URL,
    userId: import.meta.env.VITE_JOEY_USER_ID,
    movieGroups: (import.meta.env.VITE_MOVIE_IDS ?? '')
        .split(',')
        .map((g: string) => g.split('|').map((s: string) => s.trim()).filter(Boolean))
        .filter((g: string | any[]) => g.length > 0),
} as const;

export const EDGE_CACHE_TTL = 60;  // browser/CDN cache for JSON API (seconds)
const CACHE_TTL = 900;              // KV cache TTL — 15 min keeps writes under 1k/day

// ── Tautulli API response types ───────────────────────────────────

interface TautulliResponse<T> {
    response: { result: string; data: T };
}

interface MetadataPayload {
    title?: string;
    full_title?: string;
    rating_key?: string;
}

interface UserStatsEntry {
    user_id: number;
    total_plays: number;
}

interface ActivitySession {
    user_id: string | number;
    rating_key: string | number;
}

interface HistoryEntry {
    date: number;
    title?: string;
    rating_key?: string;
}

interface HistoryPayload {
    data: HistoryEntry[];
    history?: HistoryEntry[];
}

// ── App types ─────────────────────────────────────────────────────

export interface MovieStats {
    movieId: string;
    title: string;
    watchCount: string;
    watching: string;
    lastWatched: string;
}

// ── Raw Tautulli API call ─────────────────────────────────────────

async function call<T = unknown>(cmd: string, params: Record<string, string> = {}): Promise<T> {
    const start = Date.now();
    const url = new URL(config.baseUrl);
    url.searchParams.set('apikey', config.apiKey);
    url.searchParams.set('cmd', cmd);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString());
    const data = await res.json() as T;
    logger.info('tautulli_api', {
        cmd,
        status: res.status,
        duration_ms: Date.now() - start,
        ...Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'apikey')),
    });
    return data;
}

// ── KV-cached API call ────────────────────────────────────────────

async function cachedCall<T = unknown>(
    kv: KVNamespace | undefined,
    cmd: string,
    params: Record<string, string> = {},
): Promise<T> {
    const key = 'tautulli:' + cmd + ':' +
        Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join(':');

    if (kv) {
        try {
            const kvStart = Date.now();
            const cached = await kv.get(key);
            if (cached) {
                logger.info('cache_hit', { key, kv_read_ms: Date.now() - kvStart });
                return JSON.parse(cached) as T;
            }
            logger.info('cache_miss', { key });
        } catch (e: unknown) {
            logger.error('kv_read_error', { key, error: (e as Error)?.message });
        }
    }

    const data = await call<T>(cmd, params);

    if (kv) {
        try {
            await kv.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
        } catch (e: unknown) {
            logger.error('kv_write_error', { key, error: (e as Error)?.message });
        }
    }

    return data;
}

// ── Helpers ───────────────────────────────────────────────────────

function relativeTime(ts: number): string {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
    return `${Math.floor(s / 2592000)}mo ago`;
}

// ── Main export ───────────────────────────────────────────────────

/** Assemble MovieStats from cached (or fresh) Tautulli API responses.
 *  Each movieGroup is one or more rating_keys for the same film. */
export async function getCachedMovies(env: Env): Promise<MovieStats[]> {
    const kv = env?.MOVIE_CACHE;
    const uId = Number(config.userId);

    const start = Date.now();
    const movies = await Promise.all(config.movieGroups.map(async (ids: string[]): Promise<MovieStats> => {
        const primaryId = ids[0];
        const allIds = ids;

        // Metadata: use primary ID
        const rawMeta = await cachedCall<TautulliResponse<MetadataPayload>>(kv, 'get_metadata', { rating_key: primaryId });
        const meta = rawMeta?.response?.data;

        // Activity: check all IDs
        const activity = await cachedCall<TautulliResponse<{ sessions: ActivitySession[] }>>(kv, 'get_activity');

        // Watch count: sum across all IDs
        let totalPlays = 0;
        for (const id of allIds) {
            const stats = await cachedCall<TautulliResponse<UserStatsEntry[]>>(kv, 'get_item_user_stats', { rating_key: id });
            const userPlays = stats?.response?.data?.find(u => u.user_id === uId)?.total_plays ?? 0;
            totalPlays += Number(userPlays);
        }

        // Last watched: most recent date from any ID (user-filtered first, then unfiltered)
        let latestDate = 0;
        for (const id of allIds) {
            const hist = await cachedCall<TautulliResponse<HistoryPayload>>(kv, 'get_history', {
                rating_key: id, user_id: config.userId,
                length: '1', order_column: 'date', order_dir: 'desc',
            });
            const entry = hist?.response?.data?.data?.[0] ?? hist?.response?.data?.history?.[0];
            if (entry?.date && entry.date > latestDate) latestDate = entry.date;
        }
        // If user-filtered found nothing, try unfiltered across all IDs
        if (latestDate === 0) {
            for (const id of allIds) {
                const hist = await cachedCall<TautulliResponse<HistoryPayload>>(kv, 'get_history', {
                    rating_key: id, length: '1',
                    order_column: 'date', order_dir: 'desc',
                });
                const entry = hist?.response?.data?.data?.[0] ?? hist?.response?.data?.history?.[0];
                if (entry?.date && entry.date > latestDate) latestDate = entry.date;
            }
        }

        // Title: try metadata first, then history fallback
        let title = meta?.title ?? meta?.full_title;
        if (!title) {
            const histData = await cachedCall<TautulliResponse<HistoryPayload>>(kv, 'get_history', { rating_key: primaryId, length: '1' });
            const entry = histData?.response?.data?.data?.[0] ?? histData?.response?.data?.history?.[0];
            title = entry?.title ?? `Movie ${primaryId}`;
        }

        const watching = activity?.response?.data?.sessions?.some(
            s => String(s.user_id) === String(uId) && allIds.includes(String(s.rating_key)),
        );

        return {
            movieId: primaryId,
            title: title ?? `Movie ${primaryId}`,
            watchCount: String(totalPlays),
            watching: watching ? 'Yes' : 'No',
            lastWatched: latestDate ? relativeTime(latestDate) : 'never',
        };
    }));
    logger.info('movies_loaded', { count: movies.length, duration_ms: Date.now() - start });
    return movies;
}
