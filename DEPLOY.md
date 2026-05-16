# Deployment — production stack

## Live URLs

- **Backend API:** https://splash-accountability-api.fly.dev (Fly.io, region `iad`)
- **Dashboard:** Netlify (set up below) — old Fly dashboard `splash-accountability` can be destroyed once Netlify is live.

## What's already wired

- Backend deploys to Fly on push to `main` (`.github/workflows/fly-deploy.yml`), needs secret `FLY_API_TOKEN`.
- Dashboard CI runs on push to `main` and PRs (`.github/workflows/dashboard-ci.yml`).
- API CI runs compile + import smoke tests (`.github/workflows/api-ci.yml`).
- `/health` endpoint on the API returns `{"status":"ok","uptime_s":N}`.
- CORS is configurable via `CORS_ORIGINS` (comma-separated) and `CORS_ORIGIN_REGEX` Fly secrets.

## 5-minute Netlify setup (do this from the browser)

1. https://app.netlify.com → **Add new site → Import an existing project → GitHub** → pick this repo.
2. **Base directory:** `dashboard`  (Netlify auto-detects `netlify.toml` for the rest.)
3. **Environment variables** (Site settings → Environment variables):
   - `NEXT_PUBLIC_API_URL` = `https://splash-accountability-api.fly.dev`
4. Click **Deploy**. First build takes ~2 min.
5. Once live, copy the Netlify URL (e.g. `https://splash-accountability.netlify.app`) and lock down CORS on the API:
   ```bash
   flyctl secrets set \
     CORS_ORIGINS="https://splash-accountability.netlify.app" \
     CORS_ORIGIN_REGEX="https://.*--splash-accountability\.netlify\.app" \
     -a splash-accountability-api
   ```
   (The regex allows Netlify branch/preview deploys.)
6. (Optional) Add a custom domain in Netlify → Domain settings.

## Twilio WhatsApp webhook

Point Twilio's WhatsApp sandbox / number "WHEN A MESSAGE COMES IN" webhook to:

```
https://splash-accountability-api.fly.dev/whatsapp/webhook
```

(POST, x-www-form-urlencoded — Twilio's default.)

## Tear down the old Fly dashboard

Once Netlify is serving the dashboard:

```bash
flyctl apps destroy splash-accountability
```

## Next-up (do not skip before real users)

1. **Postgres** — migrate off SQLite to Neon (https://neon.tech). Free tier is plenty for launch. Set `DATABASE_URL=postgresql+psycopg://...` as a Fly secret, run `alembic upgrade head`.
2. **Object storage** — move voice notes off the Fly volume to Cloudflare R2 (zero egress).
3. **Sentry** — wire the FastAPI integration + Next.js SDK. Get a DSN, set `SENTRY_DSN` on both sides.
4. **Scale up** — bump Fly VM to `shared-cpu-2x` 1GB once you see >100 daily users; add a second region.
