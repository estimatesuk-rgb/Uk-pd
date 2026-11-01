# Football API (isolated)
This is a deliberately read-only foundation for Neon Postgres.
`GET /health` verifies the database connection and schema; `GET /api/v1/status` explains setup state.
There are **no** public player, club, membership or fixture endpoints until authentication, server-side permissions and audited league onboarding are implemented.
Never put `DATABASE_URL` into browser JS or the Git repository.
Render web service: Node, root build command `cd football-registration/api && npm install --omit=dev`, start command `cd football-registration/api && npm start`.
Set `DATABASE_URL` as a secret Render environment variable and `FRONTEND_ORIGIN` to the static app origin.
The existing Supabase-oriented SQL migrations are NOT directly compatible with Neon Auth. Use the isolated Neon schema created in the football project, and implement identity and access controls separately.
