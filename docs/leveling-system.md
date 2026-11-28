# Rana leveling system

_Designed 2026-11-25; updated 2026-11-29 for the redesign (lift targets added, stats and game-style banners removed). Supersedes PRD `rana-prd-v1-910` §7.3's XP formulas. Implemented in `js/core/game.js`; checked by `scripts/test_leveling.js`._

## Principles
1. **Everyone starts at Level 1.** No head start for self-reported experience: the app can't know how strong you are before you've trained. (The questionnaire's lift answers only set goals; they are never a personal best.)
2. **Levels measure effort against yourself.** There's no cross-user strength rating (an "overall" 60–99 rating was considered and rejected as unhealthy to compare between friends).
3. **XP means you got stronger, showed up, or hit a goal you set.** Nothing else: no XP for volume, tonnage, or sets beyond the prescription.
4. **Levels never go down.** Nothing is stored; everything is recalculated from the logged-set history, which only grows.
5. **No way to game it.** Holding back, padding volume, or making fake jumps gains little or nothing.

## Where XP comes from

### 1. Consistency (every completed session)
- **100 XP** per completed training session.
- A session counts as **completed** once at least **half** its prescribed sets are logged.
- **Streak boost:** +5% session XP for each consecutive completed session, up to **+50%** (reached at 10 in a row).
  - Rest days don't count either way: they're part of the plan.
  - A **missed** training session **halves** the streak (12 → 6), so one sick day doesn't erase weeks of work.
  - Today, while it's still in progress, is never counted as missed.

### 2. Strength increases (per exercise)
- Each set becomes one comparable number, the **estimated one-rep max**: weight × (1 + reps ÷ 30). Your best set of the day counts.
- Beating your **all-time best** for that exercise earns **10 XP per 1%** improvement, capped at **60 XP per exercise per session**.
  - Example: 185×6 (est. 222) → 185×7 (est. 228.2) = +2.8% → **28 XP**.
  - Measured against the all-time best, not last week, so a deload followed by a normal week isn't a fake "increase," and sandbagging doesn't pay.
  - Measured in %, not pounds, so a lateral raise improving is worth as much as a deadlift improving by the same share.
- **Calibration:** the first **3 sessions** of each exercise only set the baseline.
- **Only sets of 15 reps or fewer count:** the estimate gets unreliable above that.
- **Bodyweight exercises** (logged with 0 extra weight) compare reps directly: 8 → 10 pull-ups = +25%. They're tracked separately from the weighted version of the same exercise.
- **Each exercise keeps its own record** (by `exercise_key`), so swapping barbell bench for dumbbell bench starts a fresh baseline instead of looking like a drop or a jump.

### 3. Lift targets (added 2026-11-29)
Each **main lift** has a target shown on the Progress page; reaching it earns a one-time **+500 XP**.
- **Which lifts:** exercises offered for the first slot of any workout day in the library (`Rana.plan.targetLiftKeys`). Library-wide, not tied to the user's current plan, so switching plans never adds or removes XP already earned. Accessories (curls, raises, abs) have no targets.
- **The first target** comes from the questionnaire's "recent set" answer: estimated max × (1 + %), rounded **up to the next 5 lb**. The % depends on the fitness level: never trained **+25%**, returning **+15%**, training consistently **+8%**. Bodyweight lifts (pull-ups) use reps: the answer plus the %, rounded up, at least one more rep.
- **No bonus during a lift's first 3 sessions.** When the 3rd session ends, a lift with no target (the answer was skipped), or whose logged best already beats its target (the answer was too low), gets its target and starting point from the logged numbers instead.
- **After a hit** a new target appears: that session's best plus the same %. At most one hit per lift per session.
- **Honest by construction:** like all XP it is replayed from saved sets, so deleting the set that hit a target removes its bonus. The answers never count as a personal best, so a made-up number can't block real strength XP.
- Tuning: `TARGET_HIT_XP`, `TARGET_PERCENT`, `TARGET_ROUND_LB` in `XP_RULES`.

### Worked example
Week 5, 14-session streak, every prescribed set done, a +4.8% increase on 7 exercises:

| Source | XP |
|---|---|
| 7 strength increases × 48 | 336 |
| Session complete | 100 |
| Streak ×1.50 | 50 |
| **Total** | **486** |

(This came from a real in-browser test. Early on, beginners improving every exercise can earn far more from strength than from showing up. That's intended as "beginner gains," but it's worth watching with real data.)

## Suggested vs. freestyle workouts (added 2026-11-25)
The plan is a suggestion. The streak boost is the reward for following it; training on your own earns XP too, but never more than following the plan, and resting is never out-rewarded.

| What you did | Session XP | Streak | Strength XP |
|---|---|---|---|
| The suggested workout on its day (≥ half its prescribed sets) | 100 × the streak boost | **Grows** | ✅ |
| Freestyle, or a cut-short suggested workout, on a training day (≥ 3 sets) | Flat 100, no boost | **Holds** | ✅ |
| Any workout on a rest day | **None** | Unaffected | ✅ |
| Nothing on a training day | None | **Halves** | n/a |

- **Session XP is earned at most once per day**, however many workouts you do. If the suggested workout and a freestyle workout are both done, the suggested one counts.
- **Strength XP follows the exercise, not the workout type.** Every exercise keeps one record across suggested and freestyle workouts, so getting stronger always counts.
- **Only finished workouts count.** A workout still in progress earns nothing until you tap Finish; discarding one deletes its sets.
- Following the plan is rewarded through the streak boost above.
- A freestyle workout shows on the week strip as **off-plan** (not missed) when it replaces a suggested workout.

## Fixing mistakes (added 2026-11-25)
Any finished workout can be edited from its summary (sets' weight/reps changed or removed) or deleted entirely. Because XP and levels are always recalculated from the saved sets, a correction flows through everything: fixing a 1000 lb typo removes the fake "best" it created, and can lower a level the typo inflated. "Levels never go down" means never from training or resting, not from correcting your own data entry.

## The summary screen
Shown after every finished workout (`workout-summary`), and calm on purpose (no flashes, banners or combo text):
1. **Rana's line** (`Rana.coach.summaryLine`): a target hit beats a level-up beats a new best beats a plain "Logged." Rana cheers for the first three.
2. **XP lines land one at a time** while the total counts up: workout completed, streak bonus, each new best ("New best: Barbell Bench Press +4%"), each target hit ("Target hit: ... +500"), and plain-language notes for anything that earned no session XP (rest day, under 3 sets, already earned today).
3. **The level bar fills.** A level-up shows in Rana's line; a new tier adds one quiet line pointing at the milestone on Profile.
4. **A recap** lists every exercise with its sets, tagging new bests.
5. **Tap anywhere to skip.** Reduced-motion users get the finished state immediately.

## Levels
**Total XP needed to reach level n = 44 × (n − 1)²**

| Tier | Level | Total XP | Consistent 4 days/week |
|---|---|---|---|
| Spark | 1 | 0 | Day 1 |
| Ignition | 5 | 704 | ~1.5 weeks |
| Awakened | 13 | 6,336 | ~2 months |
| Ascended | 22 | 19,404 | ~5 months |
| Transcendent | 36 | 53,900 | ~1.5 years |
| Mythic | 50 | 105,644 | ~3 years |

- Target: **Mythic in ~3 years at 4 consistent days a week** (~624 sessions).
- In `scripts/test_leveling.js`'s simulation (an Upper/Lower 4-day split, never missing, strength rising ~60% over the long run with deloads every 6 weeks), the lifter reaches **Level 31 after 1 year, 42 after 2, and 50 at about week 150**.
  - The first estimate for the factor was 47; the simulation showed that lands at Level 48, so it became 44.
  - The lift-target bonus (14 hits = 7,000 XP over the 3 years) moved Level 50 earlier: without it the same lifter is at Level 49 at week 156. The curve factor was deliberately not retuned.
- At 3 days a week, consistent: roughly 4 years. Levels keep going past 50.

## Tiers
Spark → Ignition → Awakened → Ascended → Transcendent → Mythic: an original "awakening arc," with no names borrowed from any series. In the redesign they are quiet milestones on the Profile screen; the main screens say only "Level 7".

## Earned titles (placeholders)
Listed on the Profile screen:

| Title | How |
|---|---|
| The Unbroken | Reach a 10-session streak |
| Limit Breaker | 10 strength increases |
| Iron Will | 50 sessions completed |
| Centurion | 100 sessions completed |

## Stats: retired (2026-11-29)
STR / AGI / VIT are gone from the code and the screens. The Progress page's estimated maxes show real strength more honestly. The results screen shows the split and a 12-week route (tier milestones forecast by `forecastRoute()` from consistency XP only, a floor labeled "at least").

## Level-up moments
- A level-up appears in Rana's line on the workout summary (Rana cheers); there is no title card, flash or transformation.
- People who've turned on reduced motion get everything without animation.

## Social (later; needs real accounts)
- Friends, and opt-in users at the same school (grouped by .edu domain), see each other's **level and tier only**.
- Never lifts, bodyweight, or streaks (showing streaks publicly brings back streak anxiety).
- No global leaderboard.

## Tuning knobs
Everything above lives in `XP_RULES`, `LEVEL_CURVE_FACTOR`, `TIERS` and `TITLES` at the top of `js/core/game.js`; the coaching tips' numbers are in `COACH_RULES` in `js/core/coach.js`. After changing any of them, run:

```bash
node scripts/test_leveling.js
```
