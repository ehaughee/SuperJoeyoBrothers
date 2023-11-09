import { defineConfig } from 'vite';
import devServer from '@hono/vite-dev-server';
import pages from '@hono/vite-cloudflare-pages';

export default defineConfig({
  plugins: [
    pages(),
    devServer({
      entry: 'src/index.tsx',
      cf: {
        bindings: {
          TAUTULLI_API_KEY: process.env.TAUTULLI_API_KEY ?? '',
          TAUTULLI_BASE_URL: process.env.TAUTULLI_BASE_URL ?? '',
          JOEY_USER_ID: process.env.JOEY_USER_ID ?? '',
          MOVIE_ID: process.env.MOVIE_ID ?? '',
        },
      },
    }),
  ],
});
