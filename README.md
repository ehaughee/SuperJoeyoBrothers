```shell
# Local dev
cat > .env << EOF
VITE_TAUTULLI_API_KEY=
VITE_TAUTULLI_BASE_URL=
VITE_JOEY_USER_ID=
VITE_MOVIE_IDS= # Tautulli rating_keys: 1234,5678
EOF

npm install
npm run dev
```

```shell
# Deploy
npm run deploy
```
