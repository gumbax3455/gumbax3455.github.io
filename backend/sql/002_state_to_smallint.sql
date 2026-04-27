DROP INDEX IF EXISTS idx_cards_due_active;

ALTER TABLE cards
    ALTER COLUMN state DROP DEFAULT;

ALTER TABLE cards
    ALTER COLUMN state TYPE SMALLINT
    USING CASE state::text
        WHEN '0' THEN 0
        WHEN '1' THEN 1
        WHEN '2' THEN 2
        WHEN '3' THEN 3
        WHEN 'New' THEN 0
        WHEN 'Learning' THEN 1
        WHEN 'Review' THEN 2
        WHEN 'Relearning' THEN 3
        ELSE 0
    END;

ALTER TABLE cards
    ALTER COLUMN state SET DEFAULT 0;

ALTER TABLE cards
    DROP CONSTRAINT IF EXISTS cards_state_check;

ALTER TABLE cards
    ADD CONSTRAINT cards_state_check CHECK (state BETWEEN 0 AND 3);

ALTER TABLE review_logs
    ALTER COLUMN before_state TYPE SMALLINT
    USING CASE
        WHEN before_state IS NULL THEN NULL
        WHEN before_state::text = '0' THEN 0
        WHEN before_state::text = '1' THEN 1
        WHEN before_state::text = '2' THEN 2
        WHEN before_state::text = '3' THEN 3
        WHEN before_state::text = 'New' THEN 0
        WHEN before_state::text = 'Learning' THEN 1
        WHEN before_state::text = 'Review' THEN 2
        WHEN before_state::text = 'Relearning' THEN 3
        ELSE NULL
    END;

ALTER TABLE review_logs
    ALTER COLUMN after_state TYPE SMALLINT
    USING CASE
        WHEN after_state IS NULL THEN NULL
        WHEN after_state::text = '0' THEN 0
        WHEN after_state::text = '1' THEN 1
        WHEN after_state::text = '2' THEN 2
        WHEN after_state::text = '3' THEN 3
        WHEN after_state::text = 'New' THEN 0
        WHEN after_state::text = 'Learning' THEN 1
        WHEN after_state::text = 'Review' THEN 2
        WHEN after_state::text = 'Relearning' THEN 3
        ELSE NULL
    END;

ALTER TABLE review_logs
    DROP CONSTRAINT IF EXISTS review_logs_before_state_check;

ALTER TABLE review_logs
    DROP CONSTRAINT IF EXISTS review_logs_after_state_check;

ALTER TABLE review_logs
    ADD CONSTRAINT review_logs_before_state_check CHECK (before_state IS NULL OR before_state BETWEEN 0 AND 3);

ALTER TABLE review_logs
    ADD CONSTRAINT review_logs_after_state_check CHECK (after_state IS NULL OR after_state BETWEEN 0 AND 3);

CREATE INDEX IF NOT EXISTS idx_cards_due_active
    ON cards (due_date)
    WHERE state IN (1, 2, 3);

DROP TYPE IF EXISTS fsrs_state;
