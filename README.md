# Dialed

Live app: https://dialed-jude.onrender.com

On iPhone: open that link in Safari → Share → Add to Home Screen.

An installable workout log: React/Vite frontend, Express/TypeScript API, shared Zod contracts, and Supabase Postgres/Auth. Weights are kilograms; dumbbell weights are per dumbbell.

## What is implemented

- Email/password accounts, verification, password recovery, and sign-out.
- Reusable routines and independent workout sessions, editable prescriptions, completed sets, optional reps in reserve, warm-ups, and history/detail views.
- Durable, account-owned database records with row-level security. Atomic saves use stable mutation IDs and optimistic versions; completing a workout updates the same session.
- Account-scoped IndexedDB drafts, cached data, reconnect/startup retries, and conflict recovery. Legacy local-storage records remain untouched and require reviewed import in Settings.
- An expanded exercise catalogue, including Step Ups, with snapshots of primary/secondary muscles and specific heads or regions. Weekly summaries track muscle groups, specific parts, and exercise biases from completed working sets in completed sessions, Monday–Sunday in the saved timezone. Biases describe an exercise's intended emphasis; set counts do not measure activation or guarantee isolation of a head.
- Deterministic next-session load recommendations with explicit Apply. Two comparable sessions are required for progression; mixed weights and bodyweight do not receive automatic adjustments. Optional OpenAI explanations cannot change numeric decisions and fail back to the rule explanation.

## Local setup

Use Node 22.13 or newer and npm. Run all installation commands from the repository root:

```sh
npm ci
cp dialed-api/.env.example dialed-api/.env
cp dialed-ui/.env.example dialed-ui/.env.local
```

Set both Supabase URLs and publishable keys to the same project. The frontend uses `VITE_` variables; the API does not. Publishable keys are intended for clients, but never put a Supabase secret/service-role key or OpenAI key in frontend configuration. Environment files are ignored by Git.

In a new Supabase project's SQL Editor, run the SQL files in `supabase/migrations/` in filename order, then `supabase/seed.sql`. The migration creates the tables, ownership policies, and atomic save functions. Apply it once; it is not a reset script. For CLI-managed projects use `supabase db push` followed by the seed via your normal migration workflow. Regenerate catalogue seed SQL with `npm run seed:generate` when the shared catalogue changes.

Existing installations need `202610090002_muscle_targets.sql` to install the expanded catalogue and target metadata. It updates catalogue rows only; historical workout snapshots are preserved. Future catalogue updates can generate both the seed and a new migration after building shared: `node scripts/seed.cjs --migration YYYYMMDDNNNN_catalog_update.sql`. This command refuses to overwrite an existing migration.

In Supabase Authentication → URL Configuration, set Site URL to `http://localhost:5173` for local development and allow `http://localhost:5173/**` for verification and password-reset callbacks. If using `127.0.0.1`, add that origin too. Keep email confirmation enabled. Production needs its own HTTPS URLs and a configured mail provider for dependable email delivery.

Start each server in a separate terminal:

```sh
npm run dev:api
npm run dev:ui
```

Open http://localhost:5173. The API defaults to port 3000. `APP_ORIGINS` controls allowed frontend origins. Restart Vite after changing its environment. Create an account and follow the verification email, or use a dedicated test account in your development Supabase project.

For optional AI explanations, set both `OPENAI_API_KEY` and `OPENAI_MODEL` on the API server. Select a model supporting Responses Structured Outputs. No OpenAI credentials are needed for logging or rule-based recommendations. Only relevant performance and the calculated decision are sent; no account identity or free-text notes are sent.

## Verification

```sh
npm run check
```

This builds all three workspaces, lints the API/frontend, and runs the tests. CI repeats the same command after a clean `npm ci`. Tests cover progression and week boundaries; PostgreSQL saves, RLS and restart persistence using PGlite; authenticated routes and AI fallbacks; account-separated IndexedDB queues, retries/conflicts; and session/set editor interactions. No live credentials are needed for the automated suite. Live Supabase and browser smoke checks are separate from the isolated suite.

## Saving and recovery

The API verifies the bearer token and uses that user's Supabase access for all queries. Routine starts copy the prescription into a separate session. The database captures authoritative exercise targets when an exercise is first saved and preserves that snapshot when catalogue metadata changes. Older snapshots without specific targets remain readable and count toward muscle groups; the app does not infer historical head biases from today's catalogue. Versions reject conflicting device saves, and repeated mutation IDs replay their original result without duplicating a workout. Completed sessions are read-only.

The UI first saves sessions in IndexedDB, then syncs while signed in on launch, reconnect, focus, and periodic retries. A routine save interrupted after submission can also be retried with its original mutation ID. Routines and preferences require connectivity. Expired authentication preserves drafts for the same account; switching accounts does not expose another account's queue. Conflict controls retain an archive before choosing the cloud version, keeping local edits, or making a separate copy. Settings provides exports and reviewed recovery of earlier local-storage records.

Install/open the production web app online before expecting offline access. Initial sign-in and uncached data require the network. Clearing browser storage removes unsynced drafts. Keep the tab open to sync; background sync while the app is closed is not implemented. Service-worker updates are registered through the Vite PWA plugin only.

The API records AI latency/fallback events, and the frontend records sync failure categories, without workout payloads. AI cache/rate limits are per API process; use shared infrastructure before horizontally scaling. Database backups, production hosting, native packaging, and public deployment are outside this change.

For an opt-in live smoke test, create an ignored `.env.test.local` at the repository root with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, and configure the publishable key in `dialed-api/.env`. After `npm run build`, run `node dialed-api/scripts/verify-live.mjs`. It creates two disposable confirmed users, checks real API saves and account isolation, restarts a test API on port 3100, and deletes its test accounts. Use a development project. The privileged key is used only by this verification script, never by the running app. Remove the private test configuration after use.

## Host the app and install on iPhone

`render.yaml` deploys the existing Express API and built React frontend together as one free Render web service. Supabase continues to store all accounts and workouts. Connect this GitHub repository in Render's **New → Blueprint** flow and supply `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The production build forwards only those public values into Vite, and frontend requests use the site's own `/api` routes. No service-role key is needed. The service waits for GitHub checks to pass before automatically deploying later commits.

For a manual deployment, use the repository root, Node 22, build command `npm ci --include=dev && node scripts/build-production.mjs`, start command `node dialed-api/dist/index.js`, health check `/health`, and `SERVE_FRONTEND=true`. Set `NODE_ENV=production` and the two Supabase values. Express serves the frontend, supports direct navigation/password-reset routes, and keeps API routes authenticated. Hashed assets are cached; HTML and the service worker revalidate.

After Render assigns the HTTPS URL, set that address as the Supabase Auth Site URL and add `https://YOUR-SERVICE.onrender.com/**` to Redirect URLs, preserving local development entries. Open the live URL in Safari on iPhone, tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**. The app includes PNG install icons and notch/home-indicator spacing. Open it online at least once to cache the app for offline logging.

Render's free web service sleeps after 15 minutes without traffic, so the first request after inactivity can take about a minute. Local drafts remain available when the installed app has been cached, and saves retry when the API is available again. This configuration does not buy a paid plan or require your Mac to stay on.

Live hosting: Render service `dialed-jude` (`srv-db3r6ilg1s2s73bhtip0`), Frankfurt, Free plan. The service uses the public GitHub repository. For updates, verify GitHub CI first, then use Render → Manual Deploy → Deploy latest commit if a deployment has not been triggered automatically. No paid services were provisioned.

To run the same isolated verification against the hosted API instead of a local test server, set `LIVE_API_BASE=https://dialed-jude.onrender.com/api` when running `dialed-api/scripts/verify-live.mjs`. Remote mode checks hosted saving and ownership without restarting the deployed service.
