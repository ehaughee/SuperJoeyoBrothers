import { Hono } from 'hono';
import { getMovie, MOVIE_IDS, EDGE_CACHE_TTL, type MovieStats } from './tautulli';

const app = new Hono();

// Shared helper to fetch all movie stats
const fetchAll = (env: any) => Promise.all(MOVIE_IDS.map((id: string) => getMovie(id, env)));

// ── Server-rendered page ──────────────────────────────────────────

app.get('/', async (c) => {
  const movies = await fetchAll(c.env);
  return c.html(<Page movies={movies} />);
});

// ── JSON API (public, edge-cached) ────────────────────────────────

app.get('/api/movies', async (c) => {
  const movies = await fetchAll(c.env);
  c.header('Cache-Control', `public, max-age=0, s-maxage=${EDGE_CACHE_TTL}, stale-while-revalidate=60`);
  c.header('Cloudflare-CDN-Cache-Control', `max-age=${EDGE_CACHE_TTL}, stale-while-revalidate=60`);
  return c.json(movies);
});

// ── JSX templates ─────────────────────────────────────────────────

function Page({ movies }: { movies: MovieStats[] }) {
  return (
    <html>
      <head>
        <link href="/static/style.css" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
        <title>Joey Movie Tracker</title>
      </head>
      <body>
        <div class="page-wrapper">
          <div class="container">
            <img class="joe-photo" src="/static/baby-joe-head-red.png" fetchpriority="high" />
            <div class="middle-column">
              {movies.map((movie, i) => <MovieCard movie={movie} current={i === 0} key={movie.movieId} />)}
            </div>
            <img class="joe-photo" src="/static/baby-joe-head-green.png" />
          </div>
        </div>
        <script src="/static/client.js"></script>
      </body>
    </html>
  );
}

function MovieCard({ movie, current }: { movie: MovieStats; current: boolean }) {
  const label = current ? 'Joey is now binge watching' : 'Joey used to binge watch';
  return (
    <div class={"movie-card text-container" + (current ? " current" : "")} data-movie-id={movie.movieId}>
      <p>{label} <span class="dv" data-field="title">{movie.title}</span> and has seen it <span class="dv" data-field="count">{movie.watchCount}</span> times</p>
      <p class="center">
        {current ? (
          <>Is he watching it right now? <span class="dv" data-field="watching">{movie.watching}</span></>
        ) : (
          <>Last watched <span class="dv" data-field="last-watched">{movie.lastWatched}</span></>
        )}
      </p>
    </div>
  );
}

export default app;

