DO $$
DECLARE
    cards_exists BOOLEAN;
    review_logs_exists BOOLEAN;
    cards_has_state BOOLEAN;
    review_logs_has_before_state BOOLEAN;
    review_logs_has_after_state BOOLEAN;
    cards_state_udt TEXT;
    review_before_udt TEXT;
    review_after_udt TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'cards'
    ) INTO cards_exists;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'review_logs'
    ) INTO review_logs_exists;

    EXECUTE 'DROP INDEX IF EXISTS idx_cards_due_active';

    IF cards_exists THEN
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'state'
        ) INTO cards_has_state;

        IF NOT cards_has_state THEN
            EXECUTE 'ALTER TABLE cards ADD COLUMN state SMALLINT';
            cards_has_state := TRUE;
        END IF;
    ELSE
        cards_has_state := FALSE;
    END IF;

    IF cards_has_state THEN
        SELECT udt_name INTO cards_state_udt
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'state';
    END IF;

    IF cards_has_state AND cards_state_udt IS NOT NULL AND cards_state_udt <> 'int2' THEN
        EXECUTE $q$
            ALTER TABLE cards
                ALTER COLUMN state DROP DEFAULT
        $q$;
        EXECUTE $q$
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
                END
        $q$;
    END IF;

    IF cards_has_state THEN
        EXECUTE 'UPDATE cards SET state = 0 WHERE state IS NULL';
        EXECUTE 'ALTER TABLE cards ALTER COLUMN state SET DEFAULT 0';
        EXECUTE 'ALTER TABLE cards ALTER COLUMN state SET NOT NULL';
        EXECUTE 'ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_state_check';
        EXECUTE 'ALTER TABLE cards ADD CONSTRAINT cards_state_check CHECK (state BETWEEN 0 AND 3)';
    END IF;

    IF review_logs_exists THEN
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'review_logs' AND column_name = 'before_state'
        ) INTO review_logs_has_before_state;
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'review_logs' AND column_name = 'after_state'
        ) INTO review_logs_has_after_state;
    ELSE
        review_logs_has_before_state := FALSE;
        review_logs_has_after_state := FALSE;
    END IF;

    IF review_logs_has_before_state THEN
        SELECT udt_name INTO review_before_udt
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'review_logs' AND column_name = 'before_state';
    END IF;

    IF review_logs_has_before_state AND review_before_udt IS NOT NULL AND review_before_udt <> 'int2' THEN
        EXECUTE $q$
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
                END
        $q$;
    END IF;

    IF review_logs_has_after_state THEN
        SELECT udt_name INTO review_after_udt
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'review_logs' AND column_name = 'after_state';
    END IF;

    IF review_logs_has_after_state AND review_after_udt IS NOT NULL AND review_after_udt <> 'int2' THEN
        EXECUTE $q$
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
                END
        $q$;
    END IF;

    IF review_logs_has_before_state THEN
        EXECUTE 'ALTER TABLE review_logs DROP CONSTRAINT IF EXISTS review_logs_before_state_check';
        EXECUTE 'ALTER TABLE review_logs ADD CONSTRAINT review_logs_before_state_check CHECK (before_state IS NULL OR before_state BETWEEN 0 AND 3)';
    END IF;
    IF review_logs_has_after_state THEN
        EXECUTE 'ALTER TABLE review_logs DROP CONSTRAINT IF EXISTS review_logs_after_state_check';
        EXECUTE 'ALTER TABLE review_logs ADD CONSTRAINT review_logs_after_state_check CHECK (after_state IS NULL OR after_state BETWEEN 0 AND 3)';
    END IF;

    IF cards_has_state THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cards_due_active ON cards (due_date) WHERE state IN (1, 2, 3)';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fsrs_state') THEN
        EXECUTE 'DROP TYPE fsrs_state';
    END IF;
END $$;