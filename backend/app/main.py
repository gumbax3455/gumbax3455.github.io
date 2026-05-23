from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

from .db import close_pool, get_conn, open_pool
from .fsrs_service import (
    get_next_review_state,
    state_label,
    status_bucket,
)
from .settings import settings


class ReviewRequest(BaseModel):
    card_id: str = Field(min_length=1)
    rating: int = Field(ge=1, le=4)
    deck_name: str | None = None
    response_ms: int | None = Field(default=None, ge=0)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    open_pool()
    yield
    close_pool()


app = FastAPI(title="Latin FSRS API", version="0.1.0", lifespan=lifespan)

if settings.allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )


def serialize_card_row(card_row: dict[str, Any]) -> dict[str, Any]:
    state = card_row["state"]
    return {
        "card_id": card_row["card_id"],
        "deck_name": card_row["deck_name"],
        "state": state,
        "state_label": state_label(state),
        "stability": card_row["stability"],
        "difficulty": card_row["difficulty"],
        "elapsed_days": card_row["elapsed_days"],
        "scheduled_days": card_row["scheduled_days"],
        "reps": card_row["reps"],
        "lapses": card_row["lapses"],
        "last_review": card_row["last_review"],
        "due_date": card_row["due_date"],
        "status_bucket": status_bucket(state, card_row["due_date"]),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/deck-status")
def deck_status(deck: str | None = Query(default=None)) -> dict[str, Any]:
    query = """
        SELECT card_id, deck_name, state::smallint AS state, stability, difficulty, elapsed_days,
               scheduled_days, reps, lapses, last_review, due_date
        FROM cards
    """
    params: tuple[Any, ...] = ()
    if deck:
        query += " WHERE deck_name = %s"
        params = (deck,)
    query += " ORDER BY due_date NULLS FIRST, card_id"

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return {"cards": [serialize_card_row(row) for row in rows]}


@app.post("/review")
def submit_review(payload: ReviewRequest) -> dict[str, Any]:
    now = datetime.now(UTC)
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT card_id, deck_name, state::smallint AS state, stability, difficulty, elapsed_days,
                       scheduled_days, reps, lapses, last_review, due_date
                FROM cards
                WHERE card_id = %s
                FOR UPDATE
                """,
                (payload.card_id,),
            )
            row = cur.fetchone()

            step = get_next_review_state(row, payload.rating, now=now)
            deck_name = payload.deck_name or (row["deck_name"] if row else "Unknown")

            cur.execute(
                """
                INSERT INTO cards (
                    card_id, deck_name, stability, difficulty, elapsed_days, scheduled_days,
                    reps, lapses, state, last_review, due_date
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::smallint, %s, %s)
                ON CONFLICT (card_id) DO UPDATE
                SET deck_name = EXCLUDED.deck_name,
                    stability = EXCLUDED.stability,
                    difficulty = EXCLUDED.difficulty,
                    elapsed_days = EXCLUDED.elapsed_days,
                    scheduled_days = EXCLUDED.scheduled_days,
                    reps = EXCLUDED.reps,
                    lapses = EXCLUDED.lapses,
                    state = EXCLUDED.state,
                    last_review = EXCLUDED.last_review,
                    due_date = EXCLUDED.due_date
                """,
                (
                    payload.card_id,
                    deck_name,
                    step["stability"],
                    step["difficulty"],
                    step["elapsed_days"],
                    step["scheduled_days"],
                    step["reps"],
                    step["lapses"],
                    step["state"],
                    step["last_review"],
                    step["due_date"],
                ),
            )

            cur.execute(
                """
                INSERT INTO review_logs (
                    card_id, deck_name, reviewed_at, rating, response_ms,
                    before_stability, before_difficulty, before_elapsed_days, before_scheduled_days,
                    before_reps, before_lapses, before_state, before_last_review, before_due_date,
                    after_stability, after_difficulty, after_elapsed_days, after_scheduled_days,
                    after_reps, after_lapses, after_state, after_last_review, after_due_date
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s::smallint, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s::smallint, %s, %s
                )
                """,
                (
                    payload.card_id,
                    deck_name,
                    now,
                    payload.rating,
                    payload.response_ms,
                    row["stability"] if row else None,
                    row["difficulty"] if row else None,
                    row["elapsed_days"] if row else None,
                    row["scheduled_days"] if row else None,
                    row["reps"] if row else None,
                    row["lapses"] if row else None,
                    int(row["state"]) if row and row["state"] is not None else None,
                    row["last_review"] if row else None,
                    row["due_date"] if row else None,
                    step["stability"],
                    step["difficulty"],
                    step["elapsed_days"],
                    step["scheduled_days"],
                    step["reps"],
                    step["lapses"],
                    step["state"],
                    step["last_review"],
                    step["due_date"],
                ),
            )

            conn.commit()

            cur.execute(
                """
                SELECT card_id, deck_name, state::smallint AS state, stability, difficulty, elapsed_days,
                       scheduled_days, reps, lapses, last_review, due_date
                FROM cards
                WHERE card_id = %s
                """,
                (payload.card_id,),
            )
            saved = cur.fetchone()
            if not saved:
                raise HTTPException(status_code=500, detail="Could not load updated card.")

    return {"card": serialize_card_row(saved)}
