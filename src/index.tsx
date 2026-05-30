import { Hono } from 'hono';
import { getMovie, MOVIE_IDS, EDGE_CACHE_TTL, type MovieStats } from './tautulli';

const app = new Hono();

app.get('/favicon.ico', (c) => c.body(null, 204));
app.get('/favicon.svg', (c) => c.body(null, 204));

// ── Server-rendered page ──────────────────────────────────────────

app.get('/', async (c) => {
  const movies = await Promise.all(MOVIE_IDS.map((id) => getMovie(id, c.env)));
  return c.html(<Page movies={movies} />);
});

// ── JSON API (public, edge-cached) ────────────────────────────────

app.get('/api/movies', async (c) => {
  const movies = await Promise.all(MOVIE_IDS.map((id) => getMovie(id, c.env)));
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
              {movies.map((movie, i) => <MovieCard movie={movie} first={i === 0} key={movie.movieId} />)}
            </div>
            <img class="joe-photo" src="/static/baby-joe-head-green.png" />
          </div>
        </div>
        <script src="/static/client.js"></script>
      </body>
    </html>
  );
}

function MovieCard({ movie, first }: { movie: MovieStats; first: boolean }) {
  const heading = first ? 'Joey has watched' : 'Joey watched';
  return (
    <div class="movie-card text-container" data-movie-id={movie.movieId}>
      {first ? (
        <>
          <h1 class="center" data-role="title">{heading} {movie.title} {movie.watchCount} times</h1>
          <h2 class="center" data-role="watching">Is he watching it right now? {movie.watching}</h2>
        </>
      ) : (
        <>
          <h2 data-role="title">{heading} {movie.title} {movie.watchCount} times</h2>
          <h3 class="center" data-role="watching">Is he watching it right now? {movie.watching}</h3>
        </>
      )}
    </div>
  );
}

export default app;

