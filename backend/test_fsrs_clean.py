from datetime import datetime, UTC
from fsrs import Card, Rating, Scheduler, State

def _int_to_state(v: int) -> State:
    mapping = {0: State.Learning, 1: State.Learning, 2: State.Review, 3: State.Relearning}
    return mapping.get(v, State.Learning)

def _state_to_int(s: State) -> int:
    if s == State.Learning: return 1
    if s == State.Review: return 2
    if s == State.Relearning: return 3
    return 1

def _int_to_rating(v: int) -> Rating:
    mapping = {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}
    return mapping.get(v, Rating.Good)

def get_next_review_state(db_row: dict | None, rating_int: int, now: datetime | None = None) -> dict:
    review_now = now or datetime.now(UTC)
    rating = _int_to_rating(rating_int)
    scheduler = Scheduler()

    if not db_row:
        card = Card()
        prev_reps = 0
        prev_lapses = 0
        prev_state = State.Learning
        prev_last_review = None
    else:
        state_int = int(db_row.get("state", 0))
        prev_state = _int_to_state(state_int)
        
        card = Card()
        card.state = prev_state
        card.due = db_row.get("due_date") or review_now
        card.last_review = db_row.get("last_review")
        
        stability = db_row.get("stability")
        difficulty = db_row.get("difficulty")
        
        if prev_state in (State.Review, State.Relearning):
            card.stability = stability if stability is not None and stability > 0 else 2.3065
            card.difficulty = difficulty if difficulty is not None and difficulty > 0 else 5.0
        else:
            card.stability = stability
            card.difficulty = difficulty
            
        if prev_state in (State.Learning, State.Relearning):
            card.step = 0
        else:
            card.step = None

        prev_reps = int(db_row.get("reps", 0))
        prev_lapses = int(db_row.get("lapses", 0))
        prev_last_review = card.last_review

    updated_card, _log = scheduler.review_card(card, rating, review_datetime=review_now)

    new_reps = prev_reps + 1
    is_lapse = rating_int == 1 and prev_state in (State.Review, State.Relearning)
    new_lapses = prev_lapses + (1 if is_lapse else 0)

    elapsed_days = max(0, (review_now - prev_last_review).days) if prev_last_review else 0
    scheduled_days = max(0, (updated_card.due - review_now).days) if updated_card.due else 0

    return {
        "stability": updated_card.stability if updated_card.stability is not None else 0.0,
        "difficulty": updated_card.difficulty if updated_card.difficulty is not None else 0.0,
        "state": _state_to_int(updated_card.state),
        "due_date": updated_card.due or review_now,
        "last_review": updated_card.last_review or review_now,
        "reps": new_reps,
        "lapses": new_lapses,
        "elapsed_days": elapsed_days,
        "scheduled_days": scheduled_days
    }

print("New Card -> Good")
print(get_next_review_state(None, 3))
print("Learning Card -> Good")
print(get_next_review_state({"state": 1, "reps": 1, "lapses": 0}, 3))
print("Review Card -> Again")
print(get_next_review_state({"state": 2, "stability": 2.3, "difficulty": 2.1, "reps": 2}, 1))
