import { Context, Hono } from 'hono';
import { logger } from 'hono/logger'
import { renderer } from './renderer';

const apiKey = import.meta.env.VITE_TAUTULLI_API_KEY;
const baseUrl = import.meta.env.VITE_TAUTULLI_BASE_URL;
const userId = import.meta.env.VITE_JOEY_USER_ID;
const movieId = import.meta.env.VITE_MOVIE_ID;
const itemUserStatsCmd = 'get_item_user_stats';
const activityCmd = 'get_activity';

const app = new Hono();

app.get('*', renderer);
app.use('*', logger())

app.get('/', async (c) => {
  return c.render(
    <div class="container"> 
      <img class="joe-photo" src="/static/baby-joe-head-red.png" />
      <div class="text-container">
      <h1 class="center">Joey has watched the Super Mario Brothers movie {await getWatchCount()} times</h1>
      <h1 class="center">Is he watching it right now? {await getWatching()}</h1>
      </div>
      <img class="joe-photo" src="/static/baby-joe-head-green.png" />
    </div>
  );
});

const getWatchCount = async () => {
  const fullUrl = `${baseUrl}?apikey=${apiKey}&cmd=${itemUserStatsCmd}&rating_key=${movieId}`

  const resp = await fetch(fullUrl);
  const data = await resp.json() as { 'response': { 'data': []}};
  for (const user of data['response']['data'] as []) {
    if (user['user_id'] == Number(userId)) {
      return user['total_plays'];
    }
  }
  return "error";
};

const getWatching = async () => {
  const fullUrl = `${baseUrl}?apikey=${apiKey}&cmd=${activityCmd}`;
  const resp = await fetch(fullUrl);
  const data = await resp.json() as { 'response': { 'data': { "sessions": [] }}};
  console.dir(data);
  for (const session of data['response']['data']['sessions']) {
    if (session['user_id'] == userId && session['rating_key'] == movieId) {
      return "Yes";
    }
  }

  return "No";
}

export default app;
