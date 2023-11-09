import { Context, Hono } from 'hono';
import { logger } from 'hono/logger'
import { renderer } from './renderer';

const app = new Hono();

app.get('*', renderer);
app.use('*', logger())

app.get('/', async (c) => {
  return c.render(
    <h1 class="title">Super Mario Brothers Movie watches: {await getWatchCount(c)}</h1>
  );
});

const getWatchCount = async (c: Context) => {
  const apiKey = import.meta.env.VITE_TAUTULLI_API_KEY;
  const baseUrl = import.meta.env.VITE_TAUTULLI_BASE_URL;
  const userId = import.meta.env.VITE_JOEY_USER_ID;
  const movieId = import.meta.env.VITE_MOVIE_ID;
  const itemUserStatsCmd = 'get_item_user_stats';

  // https://tautulli.haughee.wtf/api/v2?apikey=yourapikeyhere&cmd=get_item_user_stats&rating_key=8789
  const fullURL = `${baseUrl}?apikey=${apiKey}&cmd=${itemUserStatsCmd}&rating_key=${movieId}`
  const resp = await fetch(fullURL);
  const data = await resp.json() as { 'response': { 'data': []}};
  for (const user of data['response']['data'] as []) {
    if (user['user_id'] == Number(userId)) {
      return user['total_plays'];
    }
  }
  return "error";
};

export default app;
