from datetime import UTC, datetime
from typing import Any

from fsrs import Card, Rating, Scheduler, State


scheduler = Scheduler()


def _enum_member(enum_cls, *candidates):
    for candidate in candidates:
        if hasattr(enum_cls, candidate):
            return getattr(enum_cls, candidate)
    raise AttributeError(f"{enum_cls.__name__} has none of {candidates}")


def _optional_enum_member(enum_cls, *candidates):
    for candidate in candidates:
        if hasattr(enum_cls, candidate):
            return getattr(enum_cls, candidate)
    return None


def int_to_rating(rating: int) -> Rating:
    mapping = {
        1: _enum_member(Rating, "Again", "AGAIN"),
        2: _enum_member(Rating, "Hard", "HARD"),
        3: _enum_member(Rating, "Good", "GOOD"),
        4: _enum_member(Rating, "Easy", "EASY"),
    }
    return mapping[rating]


def int_to_state(state: int) -> State:
    # Support multiple py-fsrs enum naming styles across versions.
    maybe_new = _optional_enum_member(State, "New", "NEW")
    learning = _enum_member(State, "Learning", "LEARNING")
    review = _enum_member(State, "Review", "REVIEW")
    relearning = _enum_member(State, "Relearning", "RELEARNING")
    mapping = {
        0: maybe_new or learning,
        1: learning,
        2: review,
        3: relearning,
    }
    return mapping.get(state, maybe_new or learning)


def state_to_int(state: State) -> int:
    maybe_new = _optional_enum_member(State, "New", "NEW")
    learning = _enum_member(State, "Learning", "LEARNING")
    review = _enum_member(State, "Review", "REVIEW")
    relearning = _enum_member(State, "Relearning", "RELEARNING")
    if maybe_new is not None and state == maybe_new:
        return 0
    if state == learning:
        return 1
    if state == review:
        return 2
    if state == relearning:
        return 3
    return 0


def state_from_db(value: Any) -> State:
    # Transition-safe DB decoding: canonical is SMALLINT (0..3),
    # but we also accept legacy enum text values during migration.
    if isinstance(value, int):
        return int_to_state(value)
    mapping = {
        "New": 0,
        "Learning": 1,
        "Review": 2,
        "Relearning": 3,
    }
    return int_to_state(mapping.get(str(value), 0))


def state_to_db(state: State) -> int:
    return state_to_int(state)


def _as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_datetime(value: Any, default: datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return default


def state_to_str(state: State) -> str:
    mapping = {
        0: "New",
        1: "Learning",
        2: "Review",
        3: "Relearning",
    }
    return mapping[state_to_int(state)]


def state_label(value: Any) -> str:
    mapping = {
        0: "New",
        1: "Learning",
        2: "Review",
        3: "Relearning",
    }
    if isinstance(value, int):
        return mapping.get(value, "New")
    legacy = {"New": "New", "Learning": "Learning", "Review": "Review", "Relearning": "Relearning"}
    return legacy.get(str(value), "New")


def build_card_from_row(row: dict) -> Card:
    card_id = _to_int_card_id(row.get("card_id"))
    state_value = state_from_db(row["state"]) if row.get("state") is not None else int_to_state(0)
    step_value = 0 if state_value in (State.Learning, State.Relearning) else None

    # Safety: py-fsrs crashes with ZeroDivisionError or AssertionError if a Review/Relearning card
    # has stability=0 or None. Supply safe defaults for legacy migrations.
    stability = _to_nullable_float(row.get("stability"))
    difficulty = _to_nullable_float(row.get("difficulty"))
    if state_value in (State.Review, State.Relearning):
        if not stability:
            stability = 2.3065  # FSRS default for 'Good' on first review
        if not difficulty:
            difficulty = 5.0    # FSRS default neutral difficulty

    card = Card(
        card_id=card_id,
        due=row["due_date"] or datetime.now(UTC),
        stability=stability,
        difficulty=difficulty,
        state=state_value,
        last_review=row["last_review"],
        step=step_value,
    )
    card.reps = row.get("reps", 0)
    card.lapses = row.get("lapses", 0)
    return card


def fresh_card() -> Card:
    card = Card()
    card.reps = 0
    card.lapses = 0
    return card


def review_step(card: Card, rating: int, now: datetime | None = None) -> dict[str, Any]:
    review_now = now or datetime.now(UTC)
    rating_enum = int_to_rating(rating)

    if hasattr(scheduler, "dict_step"):
        step = scheduler.dict_step(card, rating_enum, review_datetime=review_now)
        updated_card = step["card"]
        
        prev_reps = getattr(card, "reps", 0)
        prev_lapses = getattr(card, "lapses", 0)
        prev_state_str = state_label(card.state)
        
        reps = step.get("reps")
        if reps is None:
            reps = derive_reps(prev_reps)
            
        lapses = step.get("lapses")
        if lapses is None:
            lapses = derive_lapses(prev_lapses, prev_state_str, rating)
            
        elapsed_days = step.get("elapsed_days")
        if elapsed_days is None:
            elapsed_days = derive_elapsed_days(card.last_review, review_now)
            
        scheduled_days = step.get("scheduled_days")
        if scheduled_days is None:
            scheduled_days = derive_scheduled_days(step.get("due", updated_card.due), review_now)

        return {
            "card": updated_card,
            "stability": _as_float(step.get("stability"), _as_float(getattr(updated_card, "stability", None))),
            "difficulty": _as_float(step.get("difficulty"), _as_float(getattr(updated_card, "difficulty", None))),
            "state": _as_int(step.get("state"), state_to_db(updated_card.state)),
            "due": _as_datetime(step.get("due"), updated_card.due),
            "reps": reps,
            "lapses": lapses,
            "elapsed_days": elapsed_days,
            "scheduled_days": scheduled_days,
            "last_review": _as_datetime(step.get("last_review"), _as_datetime(getattr(updated_card, "last_review", None), review_now)),
        }

    updated_card, _review_log = scheduler.review_card(card, rating_enum, review_datetime=review_now)
    
    prev_reps = getattr(card, "reps", 0)
    prev_lapses = getattr(card, "lapses", 0)
    prev_state_str = state_label(card.state)
    
    reps = derive_reps(prev_reps)
    lapses = derive_lapses(prev_lapses, prev_state_str, rating)
    elapsed_days = derive_elapsed_days(card.last_review, review_now)
    scheduled_days = derive_scheduled_days(updated_card.due, review_now)
    
    return {
        "card": updated_card,
        "stability": _as_float(getattr(updated_card, "stability", None)),
        "difficulty": _as_float(getattr(updated_card, "difficulty", None)),
        "state": state_to_db(updated_card.state),
        "due": _as_datetime(getattr(updated_card, "due", None), review_now),
        "reps": reps,
        "lapses": lapses,
        "elapsed_days": elapsed_days,
        "scheduled_days": scheduled_days,
        "last_review": _as_datetime(getattr(updated_card, "last_review", None), review_now),
    }


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


def status_bucket(state: int | str, due_date: datetime | None, now: datetime | None = None) -> str:
    state_int = state if isinstance(state, int) else {"New": 0, "Learning": 1, "Review": 2, "Relearning": 3}.get(state, 0)
    if state_int == 0:
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
    card_id_str = str(card_id)
    return int(card_id_str) if card_id_str.isdigit() else None


def _to_nullable_float(value: float | int | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric > 0 else None
