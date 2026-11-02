# Routes
/ -> src/App.tsx pilot console
/overlay -> src/App.tsx spectator branch
/auth/twitch and /auth/twitch/callback -> server-only OAuth
No router configuration; location.pathname selects overlay.