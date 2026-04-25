from datetime import UTC, datetime

from fsrs import Card, Rating, Scheduler, State


scheduler = Scheduler()


def int_to_rating(rating: int) -> Rating:
    mapping = {
        1: Rating.Again,
        2: Rating.Hard,
        3: Rating.Good,
        4: Rating.Easy,
    }
    return mapping[rating]


def state_from_str(state: str) -> State:
    mapping = {
        "New": State.New,
        "Learning": State.Learning,
        "Review": State.Review,
        "Relearning": State.Relearning,
    }
    return mapping.get(state, State.New)


def state_to_str(state: State) -> str:
    if state == State.Learning:
        return "Learning"
    if state == State.Review:
        return "Review"
    if state == State.Relearning:
        return "Relearning"
    return "New"


def build_card_from_row(row: dict) -> Card:
    card_id = _to_int_card_id(row.get("card_id"))
    state_value = state_from_str(row["state"]) if row.get("state") else State.New
    if state_value == State.New:
        # py-fsrs expects a valid learning/review state, so we map DB "New" to Learning.
        state_value = State.Learning

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
