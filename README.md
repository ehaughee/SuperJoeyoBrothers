```shell
# Local dev
cat > .env << EOF
VITE_TAUTULLI_API_KEY=
VITE_TAUTULLI_BASE_URL=
VITE_JOEY_USER_ID=
VITE_MOVIE_IDS= # comma-separated, use | to separate multiple IDs for one movie: 83162,8789|63120
EOF

npm install
npm run preview
```

```shell
# Deploy preview
npm run deploy:preview

# Deploy prod
npm run deploy
```
