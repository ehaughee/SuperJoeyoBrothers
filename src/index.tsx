import { Hono } from 'hono';

const apiKey = import.meta.env.VITE_TAUTULLI_API_KEY;
const baseUrl = import.meta.env.VITE_TAUTULLI_BASE_URL;
const userId = import.meta.env.VITE_JOEY_USER_ID;
const movieIds = (import.meta.env.VITE_MOVIE_IDS ?? import.meta.env.VITE_MOVIE_ID ?? '')
  .split(',')
  .map((id: string) => id.trim())
  .filter(Boolean);
const itemUserStatsCmd = 'get_item_user_stats';
const activityCmd = 'get_activity';
const historyCmd = 'get_history';

const app = new Hono();

app.get('/', async (c) => {
  const movies = await Promise.all(movieIds.map(getTrackedMovie));
  const newestMovie = movies[0] ?? { title: 'New Super Mario movie', watchCount: '0', watching: 'No' };
  const otherMovies = movies.slice(1);

  return c.html(
    <html>
      <head>
        <link href="/static/style.css" rel="stylesheet" />
        <title>Joey Movie Tracker</title>
      </head>
      <body>
        <div class="page-wrapper">
          <div class="container">
            <img class="joe-photo" src="/static/baby-joe-head-red.png" />

            <div class="middle-column">
              <div class="movie-card text-container">
                <h1 class="center">Joey has watched {newestMovie.title} {newestMovie.watchCount} times</h1>
                <h2 class="center">Is he watching it right now? {newestMovie.watching}</h2>
              </div>

              {otherMovies.map((movie) => (
                <div class="movie-card text-container">
                  <h2>Joey watched {movie.title} {movie.watchCount} times</h2>
                  <h3 class="center">Is he watching it right now? {movie.watching}</h3>
                </div>
              ))}
            </div>

            <img class="joe-photo" src="/static/baby-joe-head-green.png" />
          </div>
        </div>
      </body>
    </html>
  );
});

const getTrackedMovie = async (movieId: string) => {
  const [title, watchCount, watching] = await Promise.all([
    getMovieTitle(movieId),
    getWatchCount(movieId),
    getWatching(movieId),
  ]);

  return { movieId, title, watchCount, watching };
};

const getMovieTitle = async (movieId: string) => {
  const fullUrl = `${baseUrl}?apikey=${apiKey}&cmd=get_metadata&rating_key=${movieId}`;
  const resp = await fetch(fullUrl);
  const metadata = await resp.json() as any;

  if (metadata?.title) {
    return metadata.title;
  }
  if (metadata?.full_title) {
    return metadata.full_title;
  }

  const historyUrl = `${baseUrl}?apikey=${apiKey}&cmd=${historyCmd}&rating_key=${movieId}&length=100`;
  const historyResp = await fetch(historyUrl);
  const historyData = await historyResp.json() as any;
  const historyItems = historyData?.response?.data?.data ?? historyData?.response?.data?.history ?? [];

  if (Array.isArray(historyItems)) {
    const found = historyItems.find((item: any) => String(item.rating_key) === String(movieId));
    if (found?.title) return found.title;
  }

  return `Movie ${movieId}`;
};

const getWatchCount = async (movieId: string) => {
  const fullUrl = `${baseUrl}?apikey=${apiKey}&cmd=${itemUserStatsCmd}&rating_key=${movieId}`

  const resp = await fetch(fullUrl);
  const data = await resp.json() as any;
  const rows = data?.response?.data;

  if (Array.isArray(rows)) {
    for (const user of rows) {
      if (user?.user_id == Number(userId)) {
        return user?.total_plays ?? '0';
      }
    }
  }

  return '0';
};

const getWatching = async (movieId: string) => {
  const fullUrl = `${baseUrl}?apikey=${apiKey}&cmd=${activityCmd}`;
  const resp = await fetch(fullUrl);
  const data = await resp.json() as any;
  const sessions = data?.response?.data?.sessions;

  if (Array.isArray(sessions)) {
    for (const session of sessions) {
      if (String(session?.user_id) === String(userId) && String(session?.rating_key) === String(movieId)) {
        return 'Yes';
      }
    }
  }

  return 'No';
}

export default app;
