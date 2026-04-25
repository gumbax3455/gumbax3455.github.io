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
    return Card(
        due=row["due_date"] or datetime.now(UTC),
        stability=row["stability"] or 0,
        difficulty=row["difficulty"] or 0,
        elapsed_days=row["elapsed_days"] or 0,
        scheduled_days=row["scheduled_days"] or 0,
        reps=row["reps"] or 0,
        lapses=row["lapses"] or 0,
        state=state_from_str(row["state"]) if row.get("state") else State.New,
        last_review=row["last_review"],
    )


def fresh_card() -> Card:
    return Card()


def review(card: Card, rating: int):
    return scheduler.review_card(card, int_to_rating(rating))


def status_bucket(state: str, due_date: datetime | None, now: datetime | None = None) -> str:
    if state == "New":
        return "new"
    now = now or datetime.now(UTC)
    if due_date and due_date <= now:
        return "due"
    return "mature"
