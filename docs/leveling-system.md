# Rana leveling system

_Designed 2026-11-25. Supersedes PRD `rana-prd-v1-910` §7.3's XP formulas. Implemented in `game.js`; checked by `scripts/test_leveling.js`._

## Principles
1. **Everyone starts at Level 1, with every stat at 0.** No head start for self-reported experience: the app can't know how strong you are before you've trained.
2. **Levels measure effort against yourself.** There's no cross-user strength rating (an "overall" 60–99 rating was considered and rejected as unhealthy to compare between friends).
3. **XP means you got stronger or you showed up.** Nothing else: no XP for volume, tonnage, or sets beyond the prescription.
4. **Levels and stats never go down.** Nothing is stored; everything is recalculated from the logged-set history, which only grows.
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
- Following the plan is rewarded through the streak boost above. (There is no Intelligence stat: it was removed 2026-11-27.)
- A freestyle workout shows on the week strip as **off-plan** (not missed) when it replaces a suggested workout.

## Fixing mistakes (added 2026-11-25)
Any finished workout can be edited from its summary (sets' weight/reps changed or removed) or deleted entirely. Because XP, levels and stats are always recalculated from the saved sets, a correction flows through everything: fixing a 1000 lb typo removes the fake "best" it created, and can lower a level the typo inflated. "Levels never go down" means never from training or resting, not from correcting your own data entry.

## The summary screen
Shown after every finished workout (`session-complete`):
1. **Recap:** workout name, kind and date, duration, exercises and sets; every exercise lists its sets, with a ★ on the set that earned a strength increase.
2. **XP lines land one at a time** while the big total counts up. The biggest strength gain lands last.
   - Gains under +5%: a quiet line.
   - **+5% or more: NEW RECORD** (banner, glow, screen flash).
   - Hitting the 60 XP cap: **MAX GAIN**.
   - A suggested workout on-plan: "Suggested workout complete," then **ADHERENCE ×1.35 · 6 in a row** as a combo line.
   - Plain-language notes explain anything that earned no session XP (rest day, under 3 sets, already earned today).
3. **The level bar fills.** If a level or tier was crossed, the level-up card or tier-up transformation fires at the end.
4. **Tap anywhere to skip.** Reduced-motion users get the finished state immediately.

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
- In `scripts/test_leveling.js`'s simulation (an Upper/Lower 4-day split, never missing, strength rising ~60% over the long run with deloads every 6 weeks), the lifter reaches **Level 31 after 1 year, 41 after 2, and 50 after 3**.
  - The first estimate for the factor was 47; the simulation showed that lands at Level 48, so it became 44.
- At 3 days a week, consistent: roughly 4 years. Levels keep going past 50.

## Tiers
Spark → Ignition → Awakened → Ascended → Transcendent → Mythic: an original "awakening arc," with no names borrowed from any series. Each tier has its own glow color (cyan, orange, gold, blue, violet, pink), shown on the dashboard name block and the tier-up card.

## Earned titles (placeholders)
Shown under your name on the dashboard, and announced on session complete when earned:

| Title | How |
|---|---|
| The Unbroken | Reach a 10-session streak |
| Limit Breaker | 10 strength increases |
| Iron Will | 50 sessions completed |
| Centurion | 100 sessions completed |

## Stats (STR / AGI / VIT)
- All start at **0** and are only earned from logged work (rules unchanged otherwise; see `computeStatPoints` in `game.js`).
- The results (analysis) screen no longer shows stats. Since 2026-11-25 it shows the split and a 12-week route instead: tier milestones forecast by `forecastRoute()` from consistency XP only (a floor, labeled "at least"), over calibration/build/deload phases. The dashboard's status matrix still shows each stat against a 12-week target.

## Level-up moments
- **Level-up title card:** the screen dims, a line sweeps across, and the level number slams in.
- **Tier-up transformation:** the same card in the new tier's glow color, with the tier name.
- Both show a **"what powered this"** line, e.g. *"Trap Bar Deadlift +4.8% · 14-session streak."*
- Crossing several levels at once shows one card with the final level; a tier-up takes priority over a level-up.
- People who've turned on reduced motion get the same cards without animation.

## Social (later; needs real accounts)
- Friends, and opt-in users at the same school (grouped by .edu domain), see each other's **level and tier only**.
- Never lifts, bodyweight, or streaks (showing streaks publicly brings back streak anxiety).
- No global leaderboard.

## Tuning knobs
Everything above lives in `XP_RULES`, `LEVEL_CURVE_FACTOR`, `TIERS` and `TITLES` at the top of `game.js`. After changing any of them, run:

```bash
node scripts/test_leveling.js
```
