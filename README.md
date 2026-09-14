# Submit50

Coding assignment & autograding platform for ACM VNIT — multi-language problems
(C17 / C++17 / Java 17), live "sample run" feedback, best-score scoring, and a
hardened Docker sandbox judge. Scales to a few hundred students with a couple of
judge workers.

Built on the MERN stack:

- **Web** — React + Vite + Tailwind + Monaco editor (student + admin dashboards)
- **API** — Express + Mongoose service layer, JWT session cookies, Redis-backed rate limits
- **Queue** — BullMQ on Redis (`judge` and `run` queues)
- **Judge** — separate Node worker process executing submissions in ephemeral,
  unprivileged, network-isolated Docker sandboxes built from `judge/sandbox`

## Repository layout

```
backend/     Express API (auth, assignments, problems, submissions, admin, analytics)
frontend/    React SPA (student + admin), Dockerfile + nginx.conf
judge/       BullMQ worker: pulls jobs, compiles + runs in the sandbox, persists verdicts
judge/sandbox/ Ubuntu image with only the gcc/g++/JDK toolchains (no secrets, no network tools)
```

## Quick start (local development)

Requires: Node 20+, Docker.

```bash
cp .env.example .env           # optional: docker compose vars (infra only)
cp backend/.env.example backend/.env   # edit JWT_SECRET etc.
cp judge/.env.example judge/.env

npm install                     # root (concurrently only)
npm install --prefix backend
npm install --prefix frontend
npm install --prefix judge

docker compose build sandbox    # builds the acm-judge-sandbox image once

npm run dev:all                 # infra (mongo+redis) + api + judge + web
```

Then:

```bash
npm run seed                    # optional: creates sample assignments/problems
npm run create-admin -- someone@email.com   # optional: force a role
# The UI has a Dev Login form (any email) — google OAuth is optional locally.
```

- Web: http://localhost:5173 — API: http://localhost:4000
- `dev:all` runs infra via `docker compose up -d mongo redis`; the judge needs a
  local Docker daemon for sandboxes (`JUDGE_MODE=docker`).
- Set `JUDGE_MODE=local` only as a last-resort dev fallback — it executes code
  directly on the host and refuses to start under `NODE_ENV=production`.

## Tests & build

```bash
npm run build    # type-checks + builds backend, judge, and frontend
npm test         # backend API suite (mongodb-memory-server, no Redis needed) + judge unit tests
```

The backend API tests run against an in-memory MongoDB and stub the Redis/BullMQ
layers, so no Docker or running services are required.

## Deployment

The system splits into four independently deployed parts:

1. **backend** — any Node host (Render / Fly / a small VPS behind nginx). Env:
   `NODE_ENV=production`, real `JWT_SECRET`, `MONGODB_URI`, `REDIS_URL`,
   `FRONTEND_URL`, `ADMIN_EMAILS`, `TRUST_PROXY=1`.
2. **frontend** — static build (`frontend/dist`), served by nginx (image in
   `frontend/Dockerfile`) or hosted on Vercel/Render. API calls go to the
   same origin under `/api`, proxied by nginx to the backend, so
   `VITE_API_URL` is normally unset.
3. **judge** — run as a systemd service on a **dedicated Docker-capable VPS**
   (see below). It reads jobs from the shared Redis + Mongo and spawns sandbox
   containers. Add more workers by starting more instances with different
   `JUDGE_NAME`.
4. **data + queue** — MongoDB Atlas (or a VPS with Mongo) and a managed Redis
   (Upstash / Redis Cloud / Elasticache).

### Production checklist

- Set `COOKIE_SECRET` (signs the session cookie) **and** a long random `JWT_SECRET`.
- Create admin accounts via the admin panel (Students → Add Student → role
  `ADMIN`); `ADMIN_EMAILS` is only used by the seed script.
- Set `FRONTEND_URL` to the exact origin(s) of the frontend, no trailing slash.
- Put the API behind TLS; the session cookie is `HttpOnly`, `SameSite=Lax`,
  and marked `Secure` in production.
- Never run `JUDGE_MODE=local` in production, and never give the judge host
  application secrets beyond its `MONGODB_URI`/`REDIS_URL` (it only needs the
  queues and the submissions it writes).

### Judge as a systemd service (recommended on the VPS)

```ini
# /etc/systemd/system/submit50-judge.service
[Unit]
Description=Submit50 judge worker
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
User=judge
WorkingDirectory=/opt/submit50/judge
EnvironmentFile=/opt/submit50/judge/.env
ExecStart=/usr/bin/node dist/worker.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=/

[Install]
WantedBy=multi-user.target
```

The judge itself is unprivileged; it reaches the Docker daemon via the
`docker` group / `/var/run/docker.sock` so it can create sibling sandbox
containers. Keep the judge host free of app secrets (no backend `.env`, no
Redis/Mongo admin credentials beyond what the worker technically needs).

### Single-host docker compose

For a small deployment, `docker compose up --build` brings up mongo, redis,
api, and web on one host; after `docker compose build sandbox`, add the judge
with `docker compose --profile judge up`. The containerised judge mounts the
Docker socket — see the security note at the top of `docker-compose.yml`.

## Security model

- **Sandbox**: each run is an ephemeral container from `judge/sandbox` started
  with `--network none --cap-drop ALL --read-only --pids-limit 128`
  `--memory --memory-swap --cpus` and `--security-opt no-new-privileges`,
  running as the unprivileged `judge` (uid 1500) user. No Docker CLI, no
  credentials, no network tools in the image. Java runs with an
  `-Xmx` capped at 85% of the container memory ceiling so heap exhaustion
  surfaces as a clean `MEMORY_LIMIT_EXCEEDED`, and JVM `OutOfMemoryError`
  stderr is classified the same way.
- **Per-language problems**: each problem declares `allowedLanguages` and
  per-language starter code; a submission is judged in exactly the language
  it was submitted in (never silently coerced). Reference solutions are
  stored per language and only ever exposed to admins.
- **Hidden tests stay hidden**: judge reads inputs/outputs from MongoDB
  directly. The API returns hidden-test results as verdicts only —
  `TestResult.actualOutput` is served **only for sample tests**, and problem
  GET/list endpoints never expose hidden test cases. Submissions store the
  student's code but hidden I/O never touches the API layer.
- **Sessions**: `s50_session` cookie, signed with `COOKIE_SECRET` (falls back
  to `JWT_SECRET`) and backed by a 7-day JWT. `requireAuth` re-checks the user
  in Mongo on every request, so disabling a student or changing a role applies
  immediately. Signed cookies live in `req.signedCookies`.
- **Rates**: per-IP global limiter plus stricter limits on auth, sample `run`,
  and per-student+problem `submit`. Code size capped at 64 KB.
- **Ownership**: students only ever see/edit their own submissions; admin
  routes are gated by the ADMIN role.

## Environment variables

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | backend | `production` refuses missing secrets & forces `Secure` cookies |
| `PORT` | `4000` | backend | |
| `MONGODB_URI` | `mongodb://localhost:27017/submit50` | backend, judge | prod: Atlas URI |
| `REDIS_URL` | `redis://localhost:6379` | backend, judge | |
| `JWT_SECRET` | dev fallback | backend | **must** be set in prod (48+ random bytes) |
| `COOKIE_SECRET` | falls back to `JWT_SECRET` | backend | signs the session cookie; set explicitly in prod |
| `ADMIN_EMAILS` | `admin@acmvnit.org` | backend | comma-separated; used by the seed script for the demo admin |
| `FRONTEND_URL` | `http://localhost:5173` | backend | CORS + redirect origins, comma-separated |
| `TRUST_PROXY` | `1` in prod | backend | for correct client IPs behind nginx/Render |
| `RATE_LIMIT_*`, `SUBMIT_RATE_*`, `RUN_RATE_*`, `AUTH_RATE_*` | sane defaults | backend | see `backend/.env.example` |
| `JUDGE_MODE` | `docker` | judge | `local` = host execution, dev only |
| `JUDGE_CONCURRENCY` | `2` | judge | sandboxes run in parallel |
| `SANDBOX_IMAGE` | `acm-judge-sandbox:latest` | judge | built from `judge/sandbox` |
| `JUDGE_NAME` | `judge-1` | judge | unique per worker instance |
| `COMPILER_TIMEOUT_S` / `JUDGE_TIMEOUT_GRACE_S` | `30` / `2` | judge | compilation budget + per-test slack |
| `JUDGE_PIDS_LIMIT` | `128` | judge | fork-bomb defense per sandbox (JVM JIT/GC threads need headroom) |
| `JUDGE_WORK_DIR` | `/tmp/submit50-judge-work` | judge | scratch root, auto-cleaned; **must be under `$HOME` on macOS+Colima** (bind mounts resolve inside the VM) |
| `DOCKER_HOST` | unset | judge | docker CLI socket override; required on macOS+Colima: `unix://$HOME/.colima/<profile>/docker.sock` |
| `VITE_API_URL` | unset (relative `/api`) | frontend | set only when the API is not on the same origin |

## API highlights

- `POST /api/auth/login` (email + password), `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/assignments`, `GET /api/assignments/:id`, leaderboards
- `DELETE /api/assignments/:id` (admin) — cascades problems, test cases, submissions, scores
- `DELETE /api/problems/:id` (admin) — cascades test cases, submissions, scores
- `POST /api/problems/:id/run` — sample tests only, synchronous result or `{pending:true}`; body `{ code, language }` (`c17`/`cpp17`/`java17`)
- `POST /api/problems/:id/submit` → `202 {submissionId, status:"QUEUED"}`; body `{ code, language }`; language must be in the problem's `allowedLanguages`
- `POST /api/problems/:id/tests/verify` (admin) — run the reference solution (`{ referenceSolution, language? }`, defaults to the first allowed language) against all tests
- `POST /api/submissions/:id/rejudge` (admin) — rejudges in the submission's original language
- `GET/POST|PUT/PATCH/DELETE /api/admin/*` — problems, tests, students, submissions, analytics
- `GET /api/health`

## Security model
Add rate limits