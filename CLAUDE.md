# Rana — Fitness Coaching App

_Current-state document. Last updated 2026-11-29, after the redesign. Git history holds the old dated changelog._

## What this is
A web app (not native mobile) that gives college students a structured workout plan from their goal and training days, then tracks their lifts. **Rana is the coach**: a cartoon of the user (Brennan, a fitness expert) who lives in the app and talks through speech bubbles. The student is the trainee.

Built by someone new to coding, who is learning as we build. Favor clear, simple code over clever code, and explain non-obvious choices in comments and in your answers. Vanilla HTML, CSS and JS only: no frameworks, no build tooling.

**PRD:** `rana-prd-v1-910` (approved 2026-09-11). Still the reference for the data model (§5), questionnaire (§8) and open questions (§13). **Superseded:** §7 stats and Recovery (STR/AGI/VIT and Recovery are gone), §7.3's XP formulas (see `docs/leveling-system.md`) and §10 visual design (replaced by the redesign below).

## How to work with me
- I'm the fitness expert, not the engineer. Defer to me on training and programming, but push back if a technical choice would cause real problems (data modeling, security, unmaintainable structure).
- Walk me through *why*, not just *what*, especially for new concepts.
- Before big changes, use plan mode: read the files first, propose a plan, wait for approval.
- **Rewrite, don't layer.** Scrap what isn't needed and build what is. One source of truth, derived state, small pure functions, and delete dead code the moment it is dead. Don't pile new code on old code.
- Keep only app files in the repo. Review pages and reports go in the scratchpad. Ask before adding docs.
- Ask before merging `redesign` into `main` and before pushing.

## Look and feel (the redesign, built 2026-11-28/29)
Light and warm: chalk `#EFF0EB` background, white cards, ink `#24211D`, one marigold accent `#F4A51C`. Bricolage Grotesque for headings and Figtree for body. Lucide-style line icons (`js/core/icons.js`). No gradients, glows, shadows (the only `box-shadow`s are the input focus ring and error borders), emoji or all-caps labels. Rana's five poses are flat SVGs in `assets/rana/` (plain limbs: no muscle lines, bicep bulges or arm outlines, the user doesn't like them). Tokens live in `css/tokens.css`. Rana's wording is in `js/core/coach.js`: first person, plain words, short tips that name a weight, reps or an exercise.

**Smooth transitions everywhere** (a standing requirement): cross-document view transitions (`@view-transition` in `css/base.css`, `js/core/transitions.js` in every `<head>`), `Rana.ui.transition` for in-page changes, the data cache so pages render without waiting, and everything instant under `prefers-reduced-motion`. Check every new screen for it.

## Screens and flow
Questionnaire (`onboarding`, 15 questions, one per screen) → plan reveal → sign-up → Today. Tab bar (Today / Plan / Progress / Profile) on the main screens only; focused screens (questionnaire, reveal, sign-up, workout, builder, post-workout summary) have none.

| Page | Purpose |
|---|---|
| `index.html` | redirect only |
| `onboarding.html` | the questionnaire; height is typed as feet and inches (saved in cm); the last question is "current lifts" (skipped for never-trained; it doesn't ask about the incline bench or leg press, `LIFTS_NOT_ASKED` in `plan.js`; Progress still tracks them) |
| `plan-reveal.html` | split and week on top; 12-week route, calories/macros and disclaimer below the fold; "Start my plan" locks it in |
| `sign-up.html` | **intentionally inert**: .edu email check only, saves the email, never the password |
| `today.html` | today's suggested workout (or rest day), week strip, Rana's tip, Resume/Discard for an unfinished workout |
| `workout.html` | logging, one exercise at a time: last time, rest timer, "How to do it" (a "Video coming soon" box), picker sheet for freestyle |
| `workout-summary.html` | after a workout: plain XP lines counting up, level bar. Also the logbook view (`?from=history`) with Edit |
| `progress.html` | main lifts vs targets, weekly XP chart, recent workouts; `history.html` is the full list |
| `plan.html`, `plan-builder.html` | Rana's plan and the user's own (days only), one active; builder has no tab bar |
| `profile.html` | name, Level, tier milestones, titles, email, every answer with Edit, starting lifts with Edit |

## Architecture
Plain `<script defer>` files hanging off a `window.Rana` namespace. Order on every page: data, storage, questions, plan, game, progress, coach, icons, ui, components, page, nav, then the page script. No inline scripts.

```
css/tokens.css, base.css, components.css   shared; css/pages/<page>.css only what one screen needs
js/core/   data (fetch + sessionStorage cache)   storage (the ONLY localStorage code)
           questions (the 15 questions, used by onboarding and Profile)   answer-control (one question's UI)
           plan (split lookup, schedule, two plans, repair, main lifts)   game (XP ledger, levels, tiers, titles, targets)
           progress (read models)   coach (progression rule + every Rana line)
           icons, ui (el(), buttons, confirm/sheet, transition, numericField), components, page, nav, exercise-picker
           workout, workout-view (logging logic and UI)   transitions
js/pages/  exactly one per HTML page: a single Rana.page.start({requires, tab, render(ctx)}) call
data/      exercises, splits, workouts, slots, exercise_limitations (generated; see scripts/)
scripts/   build_library.py, library_rules.py, validate_library.py, test_leveling.js
```

`Rana.page.start` loads data, reads and normalizes the profile and plan, repairs the plan if its split or day was removed, redirects if something is missing (`requires`: none, profile, plan, active-plan), builds `ctx = {data, profile, plan, today, sessions, sets, ledger()}` and calls `render`. Page scripts only render; the logic lives in tested core modules.

**Rules for code in this app**
- Nothing derived is stored. XP, levels, targets and stats are replayed from saved sets every time (`Rana.game.computeXpLedger`). Deleting or fixing a set flows through everything.
- Components return DOM elements. Stateful ones expose methods (`update`, `setValue`, `setError`).
- **Never use `window.confirm`, `alert` or `prompt`** (the Claude app's browser blocks them). Use `Rana.ui.confirm` / `Rana.ui.sheet`.
- Set boxes are number-only text boxes (`Rana.ui.numericField`).
- Storage keys are `rana:v1:*` (`profile`, `plan`, `saved_plans`, `sessions`, `logged_sets`). Reads normalize old shapes, so existing data keeps working.

## Product rules

**Plans.** Goal first, then days, from a plain table you wrote (`SPLIT_FOR` in `plan.js`): build muscle / lose fat → 3 PPL, 4 Aesthetics, 5 Hybrid, 6 PPL + Arnold; get stronger → Upper/Lower at every count; general fitness → 3 Full Body, 4–6 Upper/Lower. Someone training N days gets a split's first N days. Fitness level only tags day counts "Recommended". Focus area and "where you train" are saved but change nothing (focus area advisory by decision; every exercise has swap options, so any gym can run any plan). Every workout has an optional abs section at the end (ab sets earn strength XP but don't count toward finishing).
- Two plans, one active. `saved_plans` holds `rana` and optionally `own`; `plan` is the active schedule everything reads, with `active_plan_id`. `plan.split_id` always stays Rana's split. The **own plan is days only**: each weekday is Rest or a named training day, and the user adds exercises while logging (`workout_id: "OWN_WORKOUT"`). It counts as following the plan with 3 or more sets.
- Switching never rewrites past XP: `schedule_history` keeps each week with an `effective_from`; a switch starts today, or tomorrow if a workout was already started today.
- The schedule is a **suggestion**. A missed training day is marked "missed", never rescheduled. Training something else shows "off-plan". Any day can start a freestyle workout.

**Workouts.** Every workout is a session record (suggested, own-plan or freestyle) that exists from Start until Finish; sets point to it by `session_id`. Only finished sessions count. One workout in progress at a time. Limitations (knee, shoulder, lower back, wrist) shape only the suggested workout's picks (`data/exercise_limitations.json`, a DRAFT); freestyle ignores them. Program workouts are capped at 3 sets per exercise (`scripts/library_rules.py`, applied by the build); freestyle isn't.

**XP and levels** (full rules in `docs/leveling-system.md`). Only three sources: beating your all-time best estimated 1RM on an exercise (10 XP per 1%, capped 60 per exercise per session; the first 3 sessions of an exercise are calibration), finishing a session (100 XP plus a streak boost of 5% per session up to 50%, a miss halves the streak), and **hitting a lift target (+500 XP once)**. Rest-day workouts earn no session XP. Level n needs `44 × (n−1)²` XP; tiers Spark → Ignition (5) → Awakened (13) → Ascended (22) → Transcendent (36) → Mythic (50). Tier names and titles appear only on Profile. Main screens say "Level N".

**Effort advice** (`Rana.coach.effortNote`, shown in the workout tip bubble): if an exercise loads a joint the user listed as sensitive (`data/exercise_limitations.json`), Rana says to go light on it ("Your knee is sensitive, so go light on…"); otherwise she says to take the last set close to failure, or all the way.

**Lift targets.** Progress tracks the first lift of each day of Rana's plan (from the saved Rana plan even if the own plan is active). Target = estimated max × (1 + 25% never trained / 15% returning / 8% consistent), rounded up to 5 lb (reps for bodyweight lifts: a whole rep, at least +1). The starting-lifts answers only seed a goal and **never** seed XP personal bests. A target applies only to exercises that are the first slot of some workout day, so plan changes never change earned XP.

## Locked design decisions
1. **Rest is a suggestion, not a lock.** "Start a workout anyway" is available; it earns strength XP but no session XP.
2. **Browsing never starts a workout.** The Today card and the Plan tab are the preview of a day. (Freestyle and own-plan days go straight to logging because there's nothing to preview.)
3. **Today's workout card is minimal**: the day name and a start button; the exercise detail lives on the Plan tab.
4. **No equipment tiers** and no equipment-based plans. Equipment may return later as a profile setting.
5. **No Google Calendar in v1**, but the fixed weekly schedule rule stands, and the data model must not make Calendar hard to add later.
6. **Exercise references use `exercise_key`**, never free-text names.
7. **Calorie/macro targets are display-only** (shown once on the plan reveal): floor 1,500 kcal men / 1,200 women, rate cap about 1% bodyweight per week.
8. **Levels never go down from training or resting, and XP rewards getting stronger, showing up and hitting set targets, never volume.** Corrections to your own data may lower a level. No cross-user strength ratings; everyone starts at Level 1.
9. **Rana is the coach character**, drawn from the user. Original naming throughout: no borrowed characters, rank ladders or system dialogue.
10. **No native popups; smooth transitions; one source of truth** (see above).

## Not in v1
AI-generated plans, Google Calendar, nutrition logging, video (a placeholder box only), cardio programming, native app, social features (planned later: friends and same-school users see each other's level and tier only, never lifts, weight or streaks), equipment tiers, real authentication, cross-device sync, notifications. Don't suggest adding these.

## Testing and running
- Serve with `python3 -m http.server 8000` (the `rana` preview config in `.claude/launch.json`), because `fetch` is blocked on `file://`.
- **Test on `http://127.0.0.1:8000`, never `localhost:8000`.** The localhost origin holds the user's own data; 127.0.0.1 has separate storage.
- `node scripts/test_leveling.js` runs the real core modules in Node: XP rules, targets, coach, plan switching, workout steps, summaries, plan re-pick (169 checks). `python3 scripts/validate_library.py` checks the exercise library.
- The preview browser caches static files hard: force-refresh with `fetch(url, {cache: 'reload'})` then reload.
- The program content comes from `workout-data/workout_splits_database.xlsx`; `scripts/build_library.py` regenerates `data/*.json` from it (data now: 7 splits, 27 workout days, 144 slots, 94 exercises).

## Needs the coach's review (placeholders, not confirmed)
- The 43 exercise-library entries added in `scripts/build_library.py` and `data/exercise_limitations.json` are drafted, not reviewed. (Knee tags never swap anything; shoulder tags are broad.)
- Projected-calorie/macro formulas in `game.js` are first-pass inventions. Leveling numbers (`XP_RULES`), title names and the 12-week level forecast are tunable placeholders. The +500 target bonus moves Level 50 to about week 150.
- Coaching gaps in the workbook: 3-day PPL gives 3 chest sets a week; Upper/Lower A and B have no flat bench or hinge; few hinges and almost no glute work overall.
- Deload weeks are shown on the route but not prescribed. There's no A/B week rotation.
- Rana's lines in `coach.js` were drafted for review. The coach tips' progression rule uses starting numbers.
- Height is centimeters only. Not tested in a browser: reduced-motion summary, the very smallest phone widths.

## Open questions (PRD §13)
1. **Under-18 users:** age is saved, nothing branches on it.
3. **Calibration graduation:** only the per-exercise 3-session calibration exists; a per-movement-pattern gate isn't built.
4. **Session length:** not asked as a question.
(Focus area was resolved as advisory only.) Still open: what Progress shows when only the own plan is used (it follows Rana's saved plan), and whether Progress follows the slot's primary exercise or the swap actually logged.

## Notes to come back to (brainstorm with Opus)
- **Leveling up doesn't feel highlighted enough.** The user says that as a new user it would look empty: Level N on Today and a small bar on the summary. Ideas to explore later: a bigger level-up moment, visible next-level goals, milestone previews on Today and Progress. Game words are kept on Profile by decision (see locked decision 8 and `docs/leveling-system.md`).
- **Warm-up and feeder sets.** Wanted in the workouts, but only working sets are logged. Open design: see the memory note "warmup-feeder-sets".

## Next
0. **⏰ Reminder: per-exercise history** is the next agreed feature (tap an exercise to see every session, its sets over time, the all-time best and a trend). `Rana.progress.lastTime` and `ledger.lifts[key].history` are its foundation.
1. Coach review pass of the placeholders above.
2. Resolve the open questions.
3. Deploy (free hosting), then move storage off `localStorage` to Supabase with real accounts, which also unlocks sign-out, real .edu verification and the social features.
