# Lens Backend

The Lens backend is a Fastify API that safely fetches a public news article, extracts readable content, creates a neutral summary and verified claims, and streams grounded perspectives to the frontend. It also provides streamed perspective conversations, reporting, featured examples, and authenticated administration endpoints.

This standalone repository includes deterministic offline LLM mode, PostgreSQL schema management, tests, a Docker image, and a local Docker Compose stack.

## Core guarantees

- Source quotes are accepted only when they match article text after controlled normalization.
- Quotes are limited to 25 words and all output fields are length constrained.
- Full article text is transient and is never persisted.
- Fetching is protected against SSRF, DNS rebinding, private networks, unsafe ports, redirect abuse, oversized bodies, and unsupported types.
- Article content is treated as untrusted prompt data.
- LLM output is schema validated and grounded in verified claims.
- Non-success JSON responses use a stable envelope with a request ID.
- Flags store salted IP hashes instead of raw IP addresses.
- Production rejects default or short administrator tokens and hash salts.

## Technology

- Node.js 22, ESM, strict TypeScript
- Fastify 5, Zod, and `fastify-type-provider-zod`
- PostgreSQL 16, Drizzle ORM, and PGlite tests
- Undici, Mozilla Readability, and JSDOM
- Anthropic SDK behind an `LLMProvider` interface
- Vitest, Docker, and Docker Compose

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL 16, or Docker Desktop for the included stack
- An Anthropic API key only for `LLM_PROVIDER=anthropic`

## Local setup

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Set `LLM_PROVIDER=mock`, ensure PostgreSQL is reachable through `DATABASE_URL`, then run:

```powershell
npm.cmd run db:migrate
npm.cmd run seed
npm.cmd run dev
```

The API starts at `http://localhost:4000`; Swagger UI is at `http://localhost:4000/docs`.

## Docker Compose

The included compose file is an offline development stack with PostgreSQL and the deterministic mock provider:

```powershell
docker compose up --build
```

It exposes PostgreSQL on 5432 and the API on 4000. Its default admin token and hash salt are development-only and must never be used in production.

## Environment variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `PORT` | No | `4000` | HTTP port |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `DATABASE_URL` | Yes | Local Lens URL | PostgreSQL connection string |
| `FRONTEND_ORIGIN` | Yes | `http://localhost:3000` | Exact browser origin allowed by CORS |
| `PUBLIC_SITE_URL` | Yes | `http://localhost:3000` | Public site used in bot identification |
| `LLM_PROVIDER` | Yes | `mock` | `mock` or `anthropic` |
| `ANTHROPIC_API_KEY` | Anthropic mode | Empty | Provider credential; never commit it |
| `LLM_MODEL` | No | `claude-sonnet-5-5` | Model identifier recorded with a lens |
| `ADMIN_TOKEN` | Yes | `change-me` | Production requires at least 32 characters |
| `IP_HASH_SALT` | Yes | `change-me` | Production requires at least 32 characters |
| `BLOCKED_DOMAINS` | No | Empty | Comma-separated denylist |
| `ROBOTS_CHECK` | No | `true` | Honor robots.txt for LensBot |
| `MAX_NEW_LENSES_PER_DAY` | No | `500` | Global daily processing budget |
| `TRUST_PROXY` | No | `false` | Enable only behind an understood trusted proxy |

Keep `.env` local. Only `.env.example` is tracked.

## API overview

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness and version |
| `GET` | `/api/v1/health` | Versioned health endpoint |
| `POST` | `/api/v1/lenses` | Start analysis or return a cache hit |
| `GET` | `/api/v1/lenses/:id` | Current snapshot |
| `GET` | `/api/v1/lenses/:id/events` | Analysis SSE stream |
| `GET` | `/api/v1/featured` | Featured ready lenses |
| `POST` | `/api/v1/perspectives/:id/argue` | Stream a grounded response |
| `GET` | `/api/v1/perspectives/:id/thread` | Restore a session thread |
| `POST` | `/api/v1/perspectives/:id/flag` | Report once per hashed IP |
| `DELETE` | `/api/v1/admin/lenses/:id` | Delete with `x-admin-token` |
| `GET` | `/api/v1/admin/flags` | Review flags with `x-admin-token` |

OpenAPI schemas and interactive documentation are available at `/docs`.

### Start analysis

```powershell
curl.exe -X POST http://localhost:4000/api/v1/lenses `
  -H "Content-Type: application/json" `
  -d '{"url":"https://example.com/news/article"}'
```

### Stream events

```powershell
curl.exe -N http://localhost:4000/api/v1/lenses/LENS_ID/events
```

Events are `status`, `article`, `summary`, individual `perspective` events, and `done`; failures use `error`. Heartbeat comments keep idle connections alive.

### Argue with a perspective

```powershell
curl.exe -N -X POST http://localhost:4000/api/v1/perspectives/PERSPECTIVE_ID/argue `
  -H "Content-Type: application/json" `
  -d '{"sessionId":"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11","message":"What evidence would change this view?"}'
```

Threads allow six user turns; the seventh returns `429 RATE_LIMITED`.

## Commands

| Command | Purpose |
|---|---|
| `npm.cmd run dev` | Start with file watching |
| `npm.cmd run build` | Compile into `dist` |
| `npm.cmd run start` | Run the compiled API |
| `npm.cmd run lint` | Strict TypeScript validation |
| `npm.cmd run typecheck` | Explicit strict typecheck |
| `npm.cmd test` | Unit and integration tests |
| `npm.cmd run db:generate` | Generate Drizzle migrations |
| `npm.cmd run db:migrate` | Apply database schema |
| `npm.cmd run seed` | Migrate and seed featured examples |

## Verification baseline

- TypeScript lint/typecheck: passed
- Unit and integration tests: 24 passed
- Production compilation: passed
- Docker Compose configuration: valid

Container startup requires a running Docker daemon. Real Anthropic, public DNS, upstream article, and deployed database behavior must be verified in the target environment.

## Project structure

```text
src/
  app.ts                 Fastify composition and errors
  server.ts              Process bootstrap
  config.ts              Validated environment
  db/                    Schema, client, and migration runner
  routes/                Public and admin routes
  services/analysis/     Pipeline and quote verification
  services/ingest/       URL, SSRF, fetch, and extraction
  services/llm/          Provider interface, prompts, schemas, providers
  services/              SSE, jobs, and argue orchestration
  lib/                   Errors, IDs, hashing, and logging
scripts/seed.ts          Featured seeding
tests/                   Unit and integration coverage
```

## Production deployment

1. Provision PostgreSQL 16 and apply migrations.
2. Set `NODE_ENV=production` and exact public/frontend origins.
3. Generate independent random values of at least 32 characters for `ADMIN_TOKEN` and `IP_HASH_SALT`.
4. Select the LLM provider and set its credential.
5. Enable proxy trust only for a trusted deployment proxy.
6. Build and run the Docker image or compiled Node application.
7. Verify health, CORS, rate limits, one real article, SSE ordering, quote fidelity, and admin authorization.

The job registry uses an in-process `EventEmitter`. Multi-instance deployment requires shared job coordination and Redis or equivalent pub/sub so subscribers receive events produced by other instances.

## License

This project is licensed under the [MIT License](LICENSE). Dependencies remain governed by their respective licenses.
