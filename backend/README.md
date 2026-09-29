# ReplayPeek Sync API

Railway-ready backend for Telegram sign-in and synchronized ReplayPeek workspaces.

## Local development

1. Copy `.env.example` to `.env` and fill the values.
2. Start PostgreSQL and create the configured database.
3. Run:

```powershell
npm install
npm run migrate
npm run dev
```

The service exposes liveness at `/health` and database readiness at `/ready`.

## Railway

Create a service from this GitHub repository and set its root directory to `/backend`.
Add a PostgreSQL service and reference its `DATABASE_URL` from the API service. Generate
a public Railway domain, then set:

- `PUBLIC_BASE_URL=https://<generated-domain>`
- `DATABASE_SSL=false` for Railway private networking
- `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET` from BotFather Login Widget settings
- `TOKEN_PEPPER` to a random value of at least 32 characters
- `CORS_ORIGINS=tauri://localhost,http://tauri.localhost`
- `OPENAI_API_KEY` to a project API key stored only in Railway variables
- `OPENAI_MODEL=gpt-6-luna` (or another Responses API text model)

Set the healthcheck path to `/health`. Register
`https://<generated-domain>/v1/auth/telegram/callback` as an Allowed URL in BotFather.

The container applies ordered SQL migrations before starting the API. Session tokens are
stored only as peppered hashes. Workspace updates use a monotonically increasing revision;
stale writes receive HTTP `409` with the current server copy.
