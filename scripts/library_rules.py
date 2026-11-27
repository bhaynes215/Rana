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

# There is deliberately NO cap on how many exercises a workout has: the fitness
# expert writes each day by hand in the workbook's exercises_master sheet
# (2026-11-26), and the build keeps every row exactly as written.

# A workout's length is estimated from its sets: each set is assumed to take
# about this long to perform, plus the slot's own rest period, plus a flat
# allowance for warm-up and moving between exercises (the median gap between
# the workbook's original estimates and its set-by-set time was about 15 min).
SECONDS_PER_SET = 45
WARMUP_AND_TRANSITION_MINUTES = 15
