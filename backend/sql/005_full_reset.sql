DROP TABLE IF EXISTS cards;

CREATE TABLE cards (
    card_id TEXT PRIMARY KEY,
    deck_name TEXT,
    state SMALLINT,
    stability DOUBLE PRECISION,
    difficulty DOUBLE PRECISION,
    elapsed_days INTEGER,
    scheduled_days INTEGER,
    reps INTEGER,
    lapses INTEGER,
    last_review TIMESTAMPTZ,
    due_date TIMESTAMPTZ
);
