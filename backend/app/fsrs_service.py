from datetime import UTC, datetime

from fsrs import Card, Rating, Scheduler, State


scheduler = Scheduler()


def _enum_member(enum_cls, *candidates):
    for candidate in candidates:
        if hasattr(enum_cls, candidate):
            return getattr(enum_cls, candidate)
    raise AttributeError(f"{enum_cls.__name__} has none of {candidates}")


def int_to_rating(rating: int) -> Rating:
    mapping = {
        1: _enum_member(Rating, "Again", "AGAIN"),
        2: _enum_member(Rating, "Hard", "HARD"),
        3: _enum_member(Rating, "Good", "GOOD"),
        4: _enum_member(Rating, "Easy", "EASY"),
    }
    return mapping[rating]


def state_from_str(state: str) -> State:
    # Support multiple py-fsrs enum naming styles across versions.
    learning = _enum_member(State, "Learning", "LEARNING")
    review = _enum_member(State, "Review", "REVIEW")
    relearning = _enum_member(State, "Relearning", "RELEARNING")
    fallback = learning
    mapping = {
        "New": fallback,
        "Learning": learning,
        "Review": review,
        "Relearning": relearning,
    }
    return mapping.get(state, fallback)


def state_to_str(state: State) -> str:
    learning = _enum_member(State, "Learning", "LEARNING")
    review = _enum_member(State, "Review", "REVIEW")
    relearning = _enum_member(State, "Relearning", "RELEARNING")
    if state == learning:
        return "Learning"
    if state == review:
        return "Review"
    if state == relearning:
        return "Relearning"
    return "New"


def build_card_from_row(row: dict) -> Card:
    card_id = _to_int_card_id(row.get("card_id"))
    learning = _enum_member(State, "Learning", "LEARNING")
    state_value = state_from_str(row["state"]) if row.get("state") else learning
    maybe_new = getattr(State, "New", getattr(State, "NEW", None))
    if maybe_new is not None and state_value == maybe_new:
        # py-fsrs expects a valid learning/review state, so we map DB "New" to Learning.
        state_value = learning
    elif row.get("state") == "New":
        # py-fsrs expects a valid learning/review state, so we map DB "New" to Learning.
        state_value = learning

    return Card(
        card_id=card_id,
        due=row["due_date"] or datetime.now(UTC),
        stability=_to_nullable_float(row.get("stability")),
        difficulty=_to_nullable_float(row.get("difficulty")),
        state=state_value,
        last_review=row["last_review"],
    )


def fresh_card() -> Card:
    return Card()


def review(card: Card, rating: int):
    return scheduler.review_card(card, int_to_rating(rating))


def derive_elapsed_days(last_review: datetime | None, reviewed_at: datetime) -> int:
    if not last_review:
        return 0
    return max(0, (reviewed_at - last_review).days)


def derive_scheduled_days(due: datetime | None, reviewed_at: datetime) -> int:
    if not due:
        return 0
    return max(0, (due - reviewed_at).days)


def derive_reps(previous_reps: int | None) -> int:
    return (previous_reps or 0) + 1


def derive_lapses(previous_lapses: int | None, previous_state: str | None, rating: int) -> int:
    # Count a lapse when a review/relearning card fails with "Again".
    is_lapse = rating == 1 and previous_state in {"Review", "Relearning"}
    return (previous_lapses or 0) + (1 if is_lapse else 0)


def status_bucket(state: str, due_date: datetime | None, now: datetime | None = None) -> str:
    if state == "New":
        return "new"
    now = now or datetime.now(UTC)
    if due_date and due_date <= now:
        return "due"
    return "mature"


def _to_int_card_id(card_id: str | int | None) -> int | None:
    if card_id is None:
        return None
    if isinstance(card_id, int):
        return card_id
    digits = "".join(ch for ch in str(card_id) if ch.isdigit())
    return int(digits) if digits else None


def _to_nullable_float(value: float | int | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric > 0 else None
