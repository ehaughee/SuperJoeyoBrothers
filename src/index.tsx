import { Hono } from 'hono';
import { html } from 'hono/html';
import { getCachedMovies, EDGE_CACHE_TTL, type MovieStats } from './tautulli';
import { logger } from './logger';

const app = new Hono<{ Bindings: Env }>();

// ── Layout ────────────────────────────────────────────────────────

function Layout(props: { children?: unknown }) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="SEO is stupid" />
        <link rel="preload" href="/static/style.css" as="style" />
        <link rel="stylesheet" href="/static/style.css" />
        <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
        <link rel="preload" href="/static/baby-joe-head-red.webp" as="image" fetchpriority="high" />
        <link rel="preload" href="/static/baby-joe-head-green.webp" as="image" fetchpriority="high" />
        <title>Joey Movie Tracker</title>
      </head>
      <body>
        <main class="page-wrapper">
          <div class="container">
            <img class="joe-photo" src="/static/baby-joe-head-red.webp" alt="Joey" width="300" height="300" decoding="async" />
            <div class="middle-column">
              ${props.children}
            </div>
            <img class="joe-photo" src="/static/baby-joe-head-green.webp" alt="" width="300" height="300" decoding="async" />
          </div>
        </main>
        <script src="/static/client.js" defer></script>
      </body>
    </html>`;
}

// ── Server-rendered page ──────────────────────────────────────────

app.get('/', async (c) => {
  const start = Date.now();
  const movies = await getCachedMovies(c.env);
  const html = c.html(
    <Layout>
      {movies.map((movie, i) => <MovieCard movie={movie} current={i === 0} key={movie.movieId} />)}
    </Layout>
  );
  logger.info('page_rendered', { movies: movies.length, duration_ms: Date.now() - start });
  return html;
});

// ── JSON API (public, edge-cached) ────────────────────────────────

app.get('/api/movies', async (c) => {
  const start = Date.now();
  const movies = await getCachedMovies(c.env);
  c.header('Cache-Control', `public, max-age=0, s-maxage=${EDGE_CACHE_TTL}, stale-while-revalidate=60`);
  c.header('Cloudflare-CDN-Cache-Control', `max-age=${EDGE_CACHE_TTL}, stale-while-revalidate=60`);
  logger.info('api_response', { movies: movies.length, duration_ms: Date.now() - start });
  return c.json(movies);
});

// ── robots.txt ────────────────────────────────────────────────────

app.get('/robots.txt', (c) => {
  return c.text('User-agent: *\nAllow: /\n');
});

// ── Movie card component ──────────────────────────────────────────

function MovieCard({ movie, current }: { movie: MovieStats; current: boolean }) {
  const label = current ? 'Joey is now binge watching' : 'Joey used to binge watch';
  return (
    <div class={"movie-card text-container" + (current ? " current" : "")} data-movie-id={movie.movieId}>
      <p class="center">{label}</p>
      <p class="center"><span class="dv" data-field="title">{movie.title}</span></p>
      <p class="center">and has seen it <span class="dv" data-field="count">{movie.watchCount}</span> times</p>
      <p class="center">
        {current ? (
          <>Is he watching it right now? <span class="dv" data-field="watching">{movie.watching}</span></>
        ) : (
          <>Last watched <span class="dv" title={new Date(movie.lastWatchedUnix * 1000).toLocaleString()} data-field="last-watched">{movie.lastWatchedRelative}</span></>
        )}
      </p>
    </div>
  );
}

export default app;

