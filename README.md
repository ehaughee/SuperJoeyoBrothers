```shell
# Local dev
cat > .env << EOF
TAUTULLI_API_KEY=
TAUTULLI_BASE_URL=
JOEY_USER_ID=
MOVIE_ID=
EOF

npm install
npm run dev
```

```shell
# Deploy
npm run deploy
```
