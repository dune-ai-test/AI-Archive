# Archive AI-X

A personal AI intelligence platform. Paste an X/Twitter post → an AI model (any OpenAI-compatible endpoint) extracts a title, summary, categories and entities (companies, models, people, technologies, products) → everything is stored in a searchable SQLite knowledge base you can browse by date, category, company or model.

## Features

- **Add Post** — paste text (optionally author/URL/date), AI analyzes it automatically with retry on failure
- **Timeline** — day-grouped chronological feed with inline filters
- **Browse** — taxonomy rail: 13 seeded categories + entity facets (companies / models / people / technologies / products)
- **Search** — full-text search across titles, summaries and raw post text (SQLite FTS5), plus a ⌘K command palette
- **Post detail** — edit AI output manually, add/remove tags, re-run analysis, delete
- **Settings** — configure Base URL + API Key + Model for any OpenAI-compatible provider; test connection; export JSON
- **Optional password protection** via `APP_PASSWORD` env var for public deployments

## Tech stack

React + Vite + Tailwind CSS v4 · Hono (Node) · better-sqlite3 · Drizzle-free raw SQL with FTS5 · OpenAI-compatible chat completions API.

## Public / admin split

Set `APP_PASSWORD` to split the app into two experiences:

```bash
# local
APP_PASSWORD=mysecret npm run dev

# docker
APP_PASSWORD=mysecret docker compose up -d --build
```

- **Public** (no login): Timeline, Browse, Search — accepted posts only. Review queue, rejected content and detail pages of unpublished posts are invisible.
- **Admin** (`APP_PASSWORD`): Add Post, Requests (approve/reject), Settings, all writes and AI configuration. Admin pages show a login card; sign-out lives in Settings and the sidebar.

Without `APP_PASSWORD` everything is open (personal single-user mode).

## Development

```bash
npm install
npm run dev        # starts API on :3000 and Vite dev server on :5173
```

Open http://localhost:5173 — the first thing to do is open **Settings** and enter your AI endpoint:

| Setting | Example |
|---|---|
| Base URL | `https://api.openai.com/v1` |
| API Key | `sk-…` |
| Model | `gpt-4o-mini` |

Works with any OpenAI-compatible endpoint: OpenRouter (`https://openrouter.ai/api/v1`), Groq (`https://api.groq.com/openai/v1`), local Ollama (`http://localhost:11434/v1`), etc.

### Scripts

```bash
npm run dev        # dev servers (API + web)
npm run build      # production build of frontend into dist/
npm start          # run production server (serves dist/ + API on :3000)
npm run typecheck  # TypeScript check
```

Data is stored in `data/archive.db`.

## Deploy (Docker)

```bash
docker compose up -d --build
```

Runs at port 3000. To protect it with a password:

```bash
APP_PASSWORD=mysecret docker compose up -d --build
```

The SQLite database persists in the `./data` volume.

Deploying on Railway/Fly.io works the same way — set `PORT` if needed and mount a volume at `/app/data`.

## API overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/posts` | Add post + trigger AI analysis |
| GET | `/api/posts?category=&entity=&type=&sort=` | List/filter posts |
| GET/PATCH/DELETE | `/api/posts/:id` | Detail / edit / delete |
| POST | `/api/posts/:id/retry` | Re-run AI analysis |
| POST/DELETE | `/api/posts/:id/categories`, `/entities` | Manage tags |
| GET | `/api/taxonomy` | Categories + entities with counts |
| GET | `/api/search?q=` | Full-text search |
| GET/PUT | `/api/settings` | AI configuration |
| POST | `/api/settings/test` | Test AI connection |
| GET | `/api/settings/export` | Export full archive as JSON |

## Future ideas

X API auto-import · browser extension · semantic/embedding search · daily digest emails.
