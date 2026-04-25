# latein.org

Static frontend for Latin vocabulary learning on GitHub Pages, now prepared for a Postgres + FastAPI FSRS backend.

## Frontend

- `index.html`: Command Center + dictionary search.
- `karteikarten.html`: flashcard session view.
- `karteikarten.js`: lesson parsing, deck overview, review UI (`Again/Hard/Good/Easy`), backend API calls.
- `words.csv`: vocabulary source. Card rows now use `card_id` as first column (example: `c01-001;senātor;...`).

## Backend (FastAPI)

Backend code is in `backend/`.

### 1) Install and run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 2) Configure database schema (Postgres 17)

Run SQL migration:

- `backend/sql/001_init_fsrs.sql`

It creates:

- `cards` table with FSRS card state fields.
- `review_logs` table with before/after snapshots.
- indexes for due-card queries and review history.
- `updated_at` trigger.

### 3) Environment variables

- `DATABASE_URL`: Aiven Postgres connection string (`sslmode=require`).
- `CORS_ORIGINS`: comma-separated exact origins, for example:
  - `https://gumbax3455.github.io`
  - your custom domain (`https://...`)

### 4) API endpoints

- `GET /health`
- `GET /deck-status?deck=Lektion%201`
- `POST /review` with JSON body:

```json
{
  "card_id": "c01-001",
  "rating": 3,
  "deck_name": "Lektion 1"
}
```

## Frontend API URL setup

Set the backend URL at runtime in the browser console (or in your own config script):

```js
window.API_BASE_URL = "https://your-backend-host.example";
```

`karteikarten.js` uses this value for:

- `GET /deck-status` to color-code cards.
- `POST /review` when grading cards.

If no API URL is set, the session still runs locally without persistence.

## Hosting recommendation (GitHub Pages + backend)

Use **Render** or **Railway** for FastAPI, connected to Aiven Postgres:

1. Deploy `backend/` as a web service.
2. Set start command:
   - `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add env vars:
   - `DATABASE_URL`
   - `CORS_ORIGINS` (exact GitHub Pages/custom domain origins)
4. Verify preflight + API from browser devtools:
   - `OPTIONS /review` returns 200/204 with CORS headers.
   - `GET /deck-status` succeeds from GitHub Pages origin.
