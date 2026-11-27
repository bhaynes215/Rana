#!/usr/bin/env python3
"""
Rana — validate that every exercise_key referenced in data/slots.json actually
exists in data/exercises.json. This is the check PRD rana-prd-v1-910 section 4
asks for: "every key referenced anywhere must exist in the library... run it in
CI, or at minimum as a pre-commit step." Fails loudly (non-zero exit, printed
list of every dangling reference) rather than letting a bad swap option fail
silently in the app.

No third-party dependencies — reads the committed JSON only, not the .xlsx, so
it can run anywhere data/ is checked out.

Run: python3 scripts/validate_library.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

from library_rules import MAX_SETS_PER_EXERCISE

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def main():
    exercises = json.loads((DATA_DIR / "exercises.json").read_text())
    slots_doc = json.loads((DATA_DIR / "slots.json").read_text())

    valid_keys = {e["exercise_key"] for e in exercises}
    if len(valid_keys) != len(exercises):
        print("VALIDATION FAILED: duplicate exercise_key values in exercises.json", file=sys.stderr)
        sys.exit(1)

    slot_ids = {s["slot_id"] for s in slots_doc["slots"]}
    splits = json.loads((DATA_DIR / "splits.json").read_text())
    workout_ids = {w["workout_id"] for w in json.loads((DATA_DIR / "workouts.json").read_text())}

    errors = []
    # Every split lists its days in order (workout_ids), and each must exist.
    for split in splits:
        ids = split.get("workout_ids") or []
        if not ids:
            errors.append(f"{split['split_id']}: no workout_ids")
        for wid in ids:
            if wid not in workout_ids:
                errors.append(f"{split['split_id']}: unknown workout {wid}")
    for opt in slots_doc["slot_options"]:
        if opt["slot_id"] not in slot_ids:
            errors.append(f"slot_option references unknown slot_id {opt['slot_id']}")
        if opt["exercise_key"] not in valid_keys:
            errors.append(f"slot {opt['slot_id']}: exercise_key '{opt['exercise_key']}' not in exercises.json")

    # Program rules (scripts/library_rules.py): at most 3 sets per exercise (there
    # is no limit on exercises per workout), and no exercise twice in one workout.
    primary_by_slot = {
        o["slot_id"]: o["exercise_key"] for o in slots_doc["slot_options"] if o["option_rank"] == 1
    }
    option_count = defaultdict(int)
    for opt in slots_doc["slot_options"]:
        option_count[opt["slot_id"]] += 1
    by_workout = defaultdict(list)
    for slot in slots_doc["slots"]:
        by_workout[slot["workout_id"]].append(slot)
        if slot["working_sets"] > MAX_SETS_PER_EXERCISE:
            errors.append(f"slot {slot['slot_id']}: {slot['working_sets']} sets (max {MAX_SETS_PER_EXERCISE})")
        if option_count[slot["slot_id"]] == 0:
            errors.append(f"slot {slot['slot_id']}: has no exercise options")
    for workout_id, group in by_workout.items():
        keys = [primary_by_slot.get(s["slot_id"]) for s in group]
        repeated = sorted({k for k in keys if k and keys.count(k) > 1})
        if repeated:
            errors.append(f"{workout_id}: repeats {', '.join(repeated)}")

    if errors:
        print(f"VALIDATION FAILED: {len(errors)} problem(s)", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(1)

    print(f"OK — {len(exercises)} exercises, {len(slots_doc['slots'])} slots, "
          f"{len(slots_doc['slot_options'])} slot_options all resolve cleanly.")


if __name__ == "__main__":
    main()
