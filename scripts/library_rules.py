"""
Rana — the program-content rules, in one place.

Both scripts/build_library.py (which applies them when generating data/*.json)
and scripts/validate_library.py (which checks the generated data obeys them)
import these numbers, so there is exactly one place to change them.

These shape the PROGRAM only: the suggested workouts a split prescribes.
Freestyle workouts are the user's own and are not capped.
"""

# "I prefer 3 intense sets over 4 easier sets" (fitness expert, 2026-11-26).
# This is a ceiling, not a floor: a slot written as 2 sets stays at 2.
MAX_SETS_PER_EXERCISE = 3

# At most this many different exercises (slots) in any one workout day.
MAX_EXERCISES_PER_WORKOUT = 6

# Used to re-estimate a workout's length after the caps trim it: each set is
# assumed to take about this long to perform, plus the slot's own rest period.
SECONDS_PER_SET = 45
