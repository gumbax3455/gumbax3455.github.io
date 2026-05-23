-- Drop existing tables completely to wipe data
DROP TABLE IF EXISTS review_logs CASCADE;
DROP TABLE IF EXISTS cards CASCADE;

-- Recreate cards table with all fields required for FSRS v6 + manual tracking
CREATE TABLE cards (
    card_id TEXT PRIMARY KEY,
    deck_name TEXT NOT NULL,
    stability DOUBLE PRECISION,
    difficulty DOUBLE PRECISION,
    elapsed_days INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    state SMALLINT NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
    last_review TIMESTAMPTZ,
    due_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recreate review_logs table
CREATE TABLE review_logs (
    id BIGSERIAL PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    deck_name TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 4),
    response_ms INTEGER,
    
    -- State before review
    before_stability DOUBLE PRECISION,
    before_difficulty DOUBLE PRECISION,
    before_elapsed_days INTEGER,
    before_scheduled_days INTEGER,
    before_reps INTEGER,
    before_lapses INTEGER,
    before_state SMALLINT CHECK (before_state BETWEEN 0 AND 3),
    before_last_review TIMESTAMPTZ,
    before_due_date TIMESTAMPTZ,
    
    -- State after review
    after_stability DOUBLE PRECISION,
    after_difficulty DOUBLE PRECISION,
    after_elapsed_days INTEGER,
    after_scheduled_days INTEGER,
    after_reps INTEGER,
    after_lapses INTEGER,
    after_state SMALLINT CHECK (after_state BETWEEN 0 AND 3),
    after_last_review TIMESTAMPTZ,
    after_due_date TIMESTAMPTZ
);

-- Indexes for fast querying
CREATE INDEX idx_cards_due_active ON cards (due_date) WHERE state IN (1, 2, 3);
CREATE INDEX idx_cards_deck_due ON cards (deck_name, due_date);
CREATE INDEX idx_review_logs_card_time ON review_logs (card_id, reviewed_at DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cards_updated_at
BEFORE UPDATE ON cards
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
