# Rana redesign: execution plan

_Written 2026-11-28 (Opus) for execution on 2026-11-29 (Sonnet). Temporary: this file and `docs/redesign/` are deleted in the last phase._

---

## 0. How to run this plan (read first, every session)

You are executing a planned rewrite of the Rana front end. Before touching code in any session:

1. Read this whole file, then `CLAUDE.md`, then `docs/redesign/handoff/README.md`, `components.md` and `screens.md`. Open the screenshot for the screen you are building (`docs/redesign/handoff/screenshots/`). The mockups in `handoff/mockups/` are **reference for exact CSS values only**. Never copy them into the app.
2. Work on the branch `redesign` (created in Phase 0). **One phase = one commit or more** (commit at each green checkpoint inside a phase). Never commit to `main` until Phase 11, and only when Brennan says so.
3. Do the phases **in order**. Each phase lists what it deletes, builds and checks. A phase isn't done until every acceptance check passes.
4. **Test on `http://127.0.0.1:8000`**, never `localhost:8000`. That origin holds Brennan's own test data. Start the server with the `rana` preview config (`.claude/launch.json`), then open a tab on 127.0.0.1. Close your tab when done. Brennan's existing data must keep working after the redesign (see §5.6, migration).
5. Run `node scripts/test_leveling.js` after any change to `js/core/`. It must pass.
6. Brennan is a fitness expert who is new to code. When you finish a phase, explain in plain words what changed and why. Comments in code explain *why*, not *what*.
7. Never use `window.confirm`, `alert` or `prompt` (they're blocked in the Claude browser). Use `Rana.ui.confirm` / `Rana.ui.sheet`.
8. Don't add frameworks, npm, bundlers or build steps. Plain HTML, CSS and JS with `<script defer>` tags, as now.
9. If something in this plan turns out wrong in the real code, fix the plan's intent, not its letter, and say so in the commit message and to Brennan.

---

## 1. Engineering stance: rewrite, don't layer

Brennan's instruction: **we are not building on top of the existing code. We go in, scrap what isn't needed and build what is.** That means:

- **Every screen is rewritten against the new foundation**, not restyled in place. The old `styles.css` (2,917 lines of the dark HUD look, including dead rules such as the History filter that no longer exists) is deleted, not edited.
- **Delete before you add.** Each phase starts by removing the code it replaces. Dead code is never "left for later". Phase 10 greps for leftovers and fails the build if any remain (§9).
- **One source of truth for every concept.**
  - Question definitions live in one module, used by both the questionnaire and the Profile editor. Today `onboarding.html` and `account.js` `FIELDS` duplicate them.
  - DOM helpers live in `ui.js`. Today `function el()` is copied into six files.
  - Page start-up lives in one boot function. Today twelve files each load data, repair the plan and compute the ledger their own way.
- **Derived state stays derived.** XP, levels, bests, lift targets and target hits are **recomputed from saved sets every time**, as XP already is (see `game.js` header). Nothing new is stored that could drift. The only new stored facts are user inputs: the starting lifts and the rest-timer start.
- **Domain logic is pure and tested; pages only render.** All rules (XP, targets, coaching) live in `js/core/` as pure functions with Node tests. Page scripts read state and build DOM.
- **Names match the product.** Files are renamed to the words the app uses: Today, Workout, Progress, Profile, Plan.
- **Budget:** no page script over ~350 lines, and no core module over ~450. If one grows past that, split it by responsibility.

---

## 2. Decisions (settled with Brennan, 2026-11-28)

1. **Look and concept.** The handoff replaces the dark HUD (PRD §10) completely. Rana, a cartoon of Brennan, is the coach living in the app and speaks through speech bubbles. The student is the trainee, not an RPG hero.
2. **Game words.** Main screens say only "Level N". Tier names (Spark → Mythic) and earned titles appear only on Profile, as quiet milestones. The NEW RECORD / MAX GAIN / ADHERENCE ×1.35 banners become plain lines ("New best: Barbell bench +4%"). The XP math is unchanged.
3. **STR / AGI / VIT are retired** completely, in code and UI.
4. **Lift targets** = estimated max × (1 + %) over 12 weeks, **rounded up to the next 5 lb**. The % is by fitness level: never trained **+25%**, returning **+15%**, training consistently **+8%**.
5. **Hitting a target earns a one-time +500 XP.** A new target then appears: new estimated max + the same %. There's **no bonus during a lift's first 3 sessions**. If the lift's logged max after those 3 sessions already beats the target, the target resets from the logged numbers. The bonus is derived from saved sets, so deleting the set that hit it removes the bonus.
6. **Progress tracks the plan's main lifts:** the first slot of each day in Rana's plan, using the limitation-aware pick and counting repeats once. It does not track a fixed big 3.
7. **The lifts question asks about those main lifts.** It never changes the plan. "I haven't done this" skips one lift, and a skipped lift gets its first target at the end of its 3 calibration sessions. **Answers never seed personal bests for XP.**
8. **History** becomes "Recent workouts" at the bottom of Progress, with "See all" linking to the history page. The tabs are **Today / Plan / Progress / Profile**.
9. **Plan reveal:** split, week strip and session list on top. Below the fold: the 12-week route, the calorie/macro targets and the disclaimer.
10. **"How to do it":** a "Video coming soon" box, then muscles worked, the coaching cue and the tempo.
11. **Rana's words:** drafted in §11 of this file. Brennan edits that section before Phase 3. Build from §11 exactly.
12. **Smooth transitions everywhere.** It must feel like a deployed app: no blank frames, no pop-in and no layout jumps. See §6.

## 3. Defaults chosen in planning (Brennan: change any of these before running)

These weren't asked explicitly. Each is the simplest choice consistent with the decisions above.

| # | Default | Why |
|---|---|---|
| D1 | **Session detail screen is retired.** The Today card lists the exercises (as the mockup does) and is the preview. The Plan tab shows any day's exercises. `Start workout` goes straight to logging. | The card now does session detail's job. Locked decisions #2 and #3 are rewritten (Phase 11): browsing still never starts a workout. |
| D2 | **Stoic quotes are retired** (`data/quotes.json` and every quote panel). On rest days, Rana says something specific instead. | Rana's voice replaces the quotes. This also clears the unreviewed-translation risk in CLAUDE.md. |
| D3 | **The Recovery meter and `computeRecovery` are retired.** The 1–5 difficulty tap at the end of a workout **stays** and feeds Rana's progression rule (a 5/5 workout holds weights next time). | Recovery isn't in the design; the difficulty data gets a real use. |
| D4 | **Own plan active:** Progress still shows Rana's plan's main lifts (from `saved_plans.rana`), since an own plan has no exercises. | Keeps Progress meaningful for everyone. |
| D5 | **Swaps:** each `exercise_key` keeps its own estimated max, history and target. A Progress row follows the main lift's key, so sets logged on a swapped exercise don't move it. | You can't put a barbell and a dumbbell max on one bar. |
| D6 | **Bodyweight main lifts** (Pull-Up is the first lift on several pull days) use **reps**: "How many pull-ups in one good set?" The target is reps × (1 + %), rounded up, at least +1 rep. Added weight counts as in the XP rules. | Matches how the XP ledger already treats bodyweight sets. |
| D7 | **Never-trained students skip the lifts question** entirely. All their targets come from calibration. | They'd skip every lift anyway; it removes a confusing screen. |
| D8 | **Progression rule numbers** for Rana's tips: see §5.4 `COACH_RULES`. | Brennan's call; these are placeholders in one constant. |
| D9 | **Wide screens:** one centered column, max 520 px, on every screen. The tab bar spans the full width with its items centered. | The handoff is phone-only. One layout is less code and less to break. |
| D10 | **Suggested workouts get "Add set"** like freestyle. Extra sets earn strength XP. Completion still counts only the prescribed sets. | The mockup shows it on a suggested workout. |
| D11 | **The exit (×) button leaves the workout without a prompt.** It stays in progress and resumes from Today. Discard lives on Today's resume card. | Leaving loses nothing, so there's nothing to confirm. |

---

## 4. Target architecture

### 4.1 Files after the redesign

```
index.html              redirect only (no inline script logic beyond what's needed)
onboarding.html         questionnaire (15 questions)
plan-reveal.html        was results.html
sign-up.html            was account-creation.html
today.html              was dashboard.html
workout.html            was active-session.html (logging)
workout-summary.html    was session-complete.html (also the logbook view)
progress.html           NEW
history.html            full workout list (reached from Progress)
plan.html               was my-plan.html (Plan tab)
plan-builder.html       own plan (days only)
profile.html            was account.html

css/
  tokens.css            from the handoff, plus motion/z-index tokens
  base.css              reset, type, page shell, focus, reduced motion, view transitions
  components.css        every component in handoff/components.md, built once
  pages/<page>.css      only what one screen needs (most are short)

js/core/                 shared, loaded in this order
  data.js               fetch + session cache of data/*.json, lookup maps
  storage.js            the only localStorage access (+ profile normalization, migration)
  questions.js          NEW: the 15 question definitions (questionnaire + Profile)
  plan.js               split lookup, schedule, repair, mainLifts()
  game.js               XP ledger, levels, tiers, titles, lift history, targets, target bonus
  progress.js           NEW: read models for Progress/Today (lift rows, weekly XP, last time)
  coach.js              NEW: progression rule + every Rana line (templates from §11)
  icons.js              NEW: Lucide icons as inline SVG strings (ISC license note in header)
  ui.js                 primitives: el(), buttons, transition(), numericField, sheet/confirm, infoButton, prescription (built Phase 1)
  components.js         visual components: rana, bubbles, bars, optionGroup, chips, collapsible, field, setRow/setTable, weekRow/weekStrip, listCard, emptyState, footerBar (built Phase 1; kept separate so no file passes ~450 lines)
  page.js               NEW: Rana.page.start() boot (see 4.3)
  nav.js                tab bar
  exercise-picker.js    picker sheet
js/pages/<page>.js       one per HTML page

assets/rana/            wave, think, cheer, neutral, avatar (.svg, from the handoff)
data/                   unchanged except quotes.json deleted
scripts/                build/validate unchanged; test_leveling.js extended
```

Deleted outright: `styles.css`, `js/dashboard-state.js`, `session-detail.html/.js`, `plan-view.js` (folded into `ui.js` components), `rana-dashboard-mockup.html`, `data/quotes.json`, every old root-level page script.

### 4.2 Script order on every page

```html
<script src="js/core/data.js" defer></script>
<script src="js/core/storage.js" defer></script>
<script src="js/core/questions.js" defer></script>   <!-- only pages that need it -->
<script src="js/core/plan.js" defer></script>
<script src="js/core/game.js" defer></script>
<script src="js/core/progress.js" defer></script>
<script src="js/core/coach.js" defer></script>
<script src="js/core/icons.js" defer></script>
<script src="js/core/ui.js" defer></script>
<script src="js/core/components.js" defer></script>
<script src="js/core/page.js" defer></script>
<script src="js/core/nav.js" defer></script>         <!-- tabbed pages only -->
<script src="js/pages/<page>.js" defer></script>
```

No inline scripts. `defer` keeps the order. Include only what a page uses, but always in this order.

### 4.3 The boot contract: `Rana.page.start`

Every page script is exactly one call:

```js
Rana.page.start({
  requires: "plan",          // "none" | "profile" | "plan" | "active-plan"
  tab: "today",              // highlights the tab; omit on focused screens
  render(ctx) { /* build the DOM from ctx; no fetching here */ },
});
```

`page.start` does, in one place:
1. Load data. `Rana.data` caches the parsed JSON in `sessionStorage` under a version key, so **every page after the first renders synchronously, with no network wait** (see §6).
2. Read the profile and plan, normalize them, run `repairPlan`, and save if repaired.
3. Redirect if a requirement is missing: no profile → `onboarding.html`; plan still a draft → `plan-reveal.html`.
4. Build `ctx = { data, profile, plan, today, sessions, sets, ledger() }`. `ledger()` is **lazy and memoized**, so pages that don't need XP never compute it.
5. Call `render(ctx)`. If it throws, show one shared error state (Rana neutral: "Something didn't load. Reload and I'll try again." plus a Reload button) and `console.error` the cause.
6. Mark the page ready (§6).

### 4.4 Data model changes (all backward compatible; keys stay `rana:v1:*`)

- **Profile normalization** (`storage.normalizeProfile`, applied on read): `age`, `height`, `weight_current`, `weight_target` and `training_days_per_week` become numbers. They're saved as strings today.
- **`profile.starting_lifts`** (new, optional): `{ [exercise_key]: { weight, reps } | { skipped: true } }`. Bodyweight lifts: `{ weight: 0, reps }`. A missing key behaves as skipped. Old profiles have none, so every lift is calibrated from logs.
- **Session record**, new optional fields: `rest_started_at` (ISO) and `rest_seconds`. Cleared when the rest ends or the workout finishes.
- **Session record**, existing `difficulty` (1–5): unchanged, now read by `coach.js`.
- Nothing else is stored. Targets, target hits, bests, lift history and weekly XP are all derived.

---

## 5. Domain layer specs (Phase 2)

### 5.1 `game.js`: what goes, what stays, what's new

**Delete:**
- `statValue`, `computeStatPoints` and `computeProjectedStats`.
- `computeRecovery`.
- `NEW_RECORD_PERCENT`, plus any field that exists only for the banner (`isRecord`/`isMax` move out of game logic; the summary just lists gains).
- Stat entries in `ui.js` `INFO`.

**Keep unchanged:**
- `XP_RULES` (except the new key below).
- `xpForLevel`, `levelForXp`, `tierForLevel`, `TIERS` and `TITLES`.
- `estimatedOneRepMax`, `forecastRoute`, `computeCalorieTargets` and `xpForSession`.

**Extend `computeXpLedger`** (it already replays every finished set in date order and tracks per-exercise bests and calibration). Add a per-exercise record:

```js
ledger.lifts[exercise_key] = {
  sessions: 4,                 // finished sessions containing this key
  calibrated: true,            // sessions >= CALIBRATION_SESSIONS
  unit: "lb" | "reps",         // reps for bodyweight-only work (0 added weight)
  best: 186.7,                 // all-time best e1RM (or reps)
  history: [ { date, session_id, best } ],   // best per session, for charts/"started at"
  start: 175,                  // starting value: answer if given, else best after calibration
  target: { value: 205, set_on: "2026-11-30", source: "answer" | "calibration" | "hit" } | null,
  hits: [ { date, session_id, value } ],
};
```

**Target rules** (new `XP_RULES` keys: `TARGET_HIT_XP: 500`, `TARGET_PERCENT: { "never-trained": 0.25, "returning": 0.15, "consistently": 0.08 }`, `TARGET_ROUND_LB: 5`):
1. **Initial target from an answer:** `ceil5(e1rm(answer) × (1 + pct))`. Reps unit: `ceil(reps × (1 + pct))`, at least reps + 1.
2. **No bonus while `sessions < CALIBRATION_SESSIONS`.**
3. **When the 3rd session of the lift finishes:**
   - If there's no target (skipped), or `best ≥ target`, set `target = ceil5(best × (1 + pct))` with `source: "calibration"`, and set `start = best` if there was no answer.
   - No bonus at this point.
4. **After calibration**, the first set in a session where `e1rm ≥ target.value`:
   - add a ledger XP line `{ kind: "target", exercise_key, value, xp: 500 }`;
   - push to `hits`;
   - set the next target from that session's best (`source: "hit"`).
   - At most one hit per lift per session.
5. **The % uses `profile.fitness_level` at sign-up.** Changing it in Profile changes future targets only, because everything is replayed.
6. **Only sets counted by the strength rules count** (≤ `MAX_COUNTED_REPS`).

**`computeXpLedger` needs `profile`** for these rules. Add it to the signature (`computeXpLedger({ sets, sessions, plan, data, profile, today })`, one options object) and update every caller. There are few once pages go through `ctx.ledger()`.

**As built in Phase 2 (read this before using the ledger):**
- `ledger.lifts` is a **Map** (`exercise_key` → record). The record has `exerciseKey, mode, unit, sessions, best, history: [{ date, session_id, score }], start, target, hits`. `calibrated` is not stored: use `sessions >= XP_RULES.CALIBRATION_SESSIONS`. It points at an exercise's most recent mode (weighted or bodyweight).
- **Targets and the bonus apply only to "main lift" exercises**: `Rana.plan.targetLiftKeys(data)`, which is every exercise offered for the FIRST slot of ANY workout day in the library. It is library-wide on purpose, not the user's current plan, so changing goal or split later never adds or removes XP already earned (levels must never go down). It also covers limitation swaps (still options of the same slot). Curls, raises and abs never have targets. Progress rows show only the user's own plan's main lifts (`Rana.plan.mainLifts`), a subset of that set.
- `sessionEntries.get(id)` and each `entries` day have `targetHits: [{ exerciseKey, mode, unit, value, next, xp, sessionId }]` and `targetXp`; `xpForSession` includes it. `Rana.game.nextTarget(value, unit, profile)` is exported.
- Starting-lift answers seed targets only for tracked keys, and never set `best` (so they never count as a personal best).
- Simulation result: 14 hits = 7,000 XP over 3 years; Level 50 lands at about week 150 (it was not reached by week 156 without the bonus).

### 5.2 `plan.js` additions

- **`mainLifts(planDef, data, profile)`:** for each workout day of Rana's plan in schedule order, take slot 1 and the limitation-aware pick (`pickSuggestedOption`), dedupe by `exercise_key`, and return `[{ exercise_key, workout_id, unit }]`. Used by the lifts question, Progress and Profile.
- **Delete anything only session detail used.** Keep `ABS_HINT` and `absOptions`; the logging screen uses them.

### 5.3 `progress.js` (new, pure)

- `liftRows(ctx)`: for each main lift, return `{ name, unit, current, start, target, delta, state: "tracking" | "calibrating" (n of 3) | "not-logged" }`.
- `weeklyXp(ledger, today, weeks = 5)`: Monday-start weeks → `[{ weekStart, xp, levelReached | null }]`.
- `lastTime(exercise_key, sets, sessions, excludeSessionId)`: the most recent finished session's sets for that key → `[{ weight, reps }]`. This is the core query that per-exercise history will later reuse. Keep it general.
- `recentSessions(n)` for the Progress list.

### 5.4 `coach.js` (new, pure): progression rule and Rana's lines

```js
const COACH_RULES = {            // Brennan: placeholders, change freely
  INCREMENT_LOWER_LB: 10,        // barbell/machine lifts whose muscle_group is Quads, Hamstrings, Glutes
  INCREMENT_UPPER_LB: 5,         // everything else (dumbbells: per dumbbell)
  BODYWEIGHT_ADD_LB: 5,          // once every set hits the top of the range
  MISSED_SETS_TO_HOLD: 2,        // sets below the range bottom → hold weight
  MISSES_TO_DROP: 2,             // consecutive "held for misses" sessions → drop
  DROP_PERCENT: 0.10,            // the drop, rounded to 5 lb
  HARD_DIFFICULTY: 5,            // a 5/5 workout → hold everything next time
};
```

`suggestion(exercise_key, slot, ctx)` returns `{ kind, weight | null, text }`:

| Condition (last session of this key) | kind | Pre-filled weight |
|---|---|---|
| No history | `first-time` | none |
| Fewer than 3 sessions | `calibrating` | last weight |
| Last workout rated ≥ `HARD_DIFFICULTY` | `hold-hard` | last weight |
| Every working set ≥ the top of the rep range | `add` | last + increment |
| ≥ `MISSED_SETS_TO_HOLD` sets below the bottom, `MISSES_TO_DROP` times in a row | `drop` | last × (1 − DROP), rounded to 5 |
| ≥ `MISSED_SETS_TO_HOLD` sets below the bottom | `hold-missed` | last weight |
| Otherwise | `hold-reps` (go for +1 rep) | last weight |

`text` comes from the §11 templates. Screen-level pickers:
- `todayTip(ctx)`: the first slot of today's workout with an actionable `kind`. On a rest day, the rest-day line. With no data, the first-workout line.
- `progressTip(ctx)`: the fastest-rising main lift over the last 5 weeks. Otherwise the nearest target ("10 lb to go"). Otherwise the empty line.
- `summaryLine(result)`: target hit > level up > new best > plain finish.

Rules from the handoff: tips are under ~90 characters and always name a weight, reps or an exercise. Never generic motivation.

### 5.5 Tests (`scripts/test_leveling.js`)

- Update the vm loader paths to `js/core/*.js` and load `progress.js` and `coach.js`.
- Delete the stats and recovery assertions.
- Add section 8, **Targets**:
  - the answer sets the target;
  - no bonus inside calibration;
  - the reset after calibration when best ≥ target;
  - the +500 line on a hit;
  - a new target after a hit;
  - at most one hit per session;
  - deleting the hitting set removes the bonus;
  - reps unit for pull-ups;
  - a skipped lift gets its target after its 3rd session.
- Add section 9, **Coach**: every row of the §5.4 table, and the increment by muscle group.
- **Re-run the 3-year simulation** with target hits included (assume the simulated lifter's estimated max climbs as now). Print when Level 50 lands. **Don't retune `LEVEL_CURVE_FACTOR`.** Report the number to Brennan and let him decide.

### 5.6 Migration and compatibility (Brennan's localhost data must survive)

- `normalizeProfile` on read (numbers).
- A missing `starting_lifts` means everything is calibrated from logs.
- Old sessions without rest fields are fine.
- Plans: `repairPlan` is unchanged.
- **Verification:**
  1. On 127.0.0.1, seed storage with a copy of the *shape* of the old data. Use a fixture built in the test tab, never Brennan's real data.
  2. Load every page and confirm there are no errors and XP is identical before and after (record the old total in Phase 0).

---

## 6. Smooth transitions (cross-cutting; built in Phase 1, checked in every phase)

Why it's choppy today: every screen is a full page load, so you see a blank frame, then fallback fonts, then content appearing after `fetch`, and finally the tab bar, injected by the last deferred script.

Fix:
1. **Cross-document View Transitions** in `base.css`:
   ```css
   @view-transition { navigation: auto; }
   ::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--dur-base); animation-timing-function: var(--ease-out); }
   .tabbar { view-transition-name: tabbar; }          /* stays still while content crossfades */
   .workout-header { view-transition-name: workout-header; }
   @media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } }
   ```
   Chrome/Edge and Safari 18.2+ crossfade. Firefox navigates normally, which is fine.
2. **No empty frame:**
   - `html { background: var(--color-bg) }`.
   - `data.js` session cache, so after the first page, `render` runs synchronously during the deferred-script phase, before first paint.
   - Only on a real network wait (the first page of a tab) does `<main>` start at `opacity: 0` and fade in over `--dur-fast` once ready (`body[data-ready]`).
3. **The tab bar is part of the first render:** `nav.js` draws it during boot, and `body.has-tabbar` padding comes from the HTML class, not added later. Nothing below it jumps.
4. **Fonts:** keep the handoff's Google Fonts link with `preconnect` and `display=swap`. Give the fallback stack size-adjusted metrics (`size-adjust`/`ascent-override` on a local fallback `@font-face`) so the swap doesn't shift layout.
   - Self-hosting the fonts would be better still. Optional: ask Brennan before downloading any files.
5. **In-page motion** uses `document.startViewTransition` where available (instant fallback otherwise), wrapped as `Rana.ui.transition(updateFn)`:
   - questionnaire question → question (outgoing fades, the new bubble rises 8 px);
   - logging exercise → exercise (a short horizontal slide, direction-aware);
   - opening and closing sheets and the collapsible.
6. **Micro-interactions:**
   - button press state (`transform: scale(.98)` over `--dur-fast`);
   - progress-bar `width` transitions only when the value changes;
   - the done-toggle fill;
   - number count-ups on the summary only.
7. **Reduced motion:** all of the above becomes instant (the token file already zeroes durations, and the view-transition rule is off).
8. **Never animate layout properties** other than progress-bar width. Use `transform` and `opacity`.
9. **Acceptance in every phase:** navigate between the phase's screens and their neighbors at 390 px. There should be no white flash, no content popping in after first paint, no font jump and no tab-bar jump. Then repeat with reduced motion emulated: everything is instant and nothing breaks.

---

## 7. Phases

Each phase lists **Delete → Build → Check**. "Check" always includes: zero console errors, the §6 transition check, 390 px vs the screenshot, a pass at 1280 px, keyboard focus visible, and `node scripts/test_leveling.js` if core changed.

### Phase 0: Baseline (small)
1. On `main`, commit the uncommitted 2026-11-28 work (tab bar, two plans, Account) as its own commit: "Add tab bar, two plans and Account page". Don't include `docs/redesign/`.
2. `git switch -c redesign`, then commit `docs/redesign/` ("Add redesign plan and design handoff (temporary)").
3. Run `node scripts/test_leveling.js` and save its output to the scratchpad as the baseline. Note the 3-year simulation result.
4. On 127.0.0.1, build a fixture via the questionnaire with a few logged workouts. Record total XP and level as the regression baseline.

### Phase 1: Foundation (CSS, components, boot, transitions)
**Delete:** `styles.css`, the old font `<link>`s, `function el()` copies (moved into `ui.js`) and `plan-view.js` (re-created as components). Old pages will look unstyled until their phase. That's expected on this branch.

**Build:**
- **Directory moves** per §4.1 for core modules (`git mv` to keep history). Update the test loader paths.
- **CSS:**
  - `css/tokens.css`: the handoff tokens plus `--z-tabbar`, `--z-sheet` and `--tabbar-h: 84px`.
  - `css/base.css`: reset, body type, `.num` tabular, the page shell (24 px margins, 52 px top, max-width 520 px centered), focus ring, `[hidden]{display:none!important}`, reduced motion, §6 rules.
  - `css/components.css`: every component in `components.md`.
    - Rana pose and avatar; interview bubble; tip bubble.
    - Progress bars: level, lift, rest, steps, onboarding.
    - Buttons: primary, secondary, text, icon.
    - Cards: hero, list, option, number tile, collapsible.
    - Inputs: onboarding field, set field, chips, step chip, done toggle; plus the set table and tab bar.
    - New, matching the same language:
      - **sheet** (bottom sheet for confirm, the name prompt and the exercise picker);
      - **week row** (Today's small 7-day row: done = accent dot with check, today = ink ring, training = line ring, rest = muted dash, missed = muted ring with × icon, off-plan = dashed accent ring; every state has text for screen readers);
      - **week strip** (plan reveal and Plan tab, 92 px blocks);
      - **empty state** (Rana wave plus one line plus one action).
- **`js/core/icons.js`:** the Lucide icons listed in `components.md` (+ `trash`, `pencil`, `chevron-right`, `x-circle` if needed) as SVG strings; `Rana.icons.svg(name, { size, label })`.
- **`ui.js`:**
  - Move `el()` here.
  - Keep and restyle `numericField`, `infoButton` (RPE only) and `confirm` (now a sheet).
  - Add `sheet({ title, body, actions })`, `ranaPose(pose, width)`, `ranaTip(text, { size })`, `interview(text, pose)`, `progressBar({ variant, value, max, label })`, `optionCard`, `numberTile`, `chips`, `collapsible`, `weekRow`, `weekStrip`, `listCard` and `transition(fn)`. (As built: primitives in `ui.js`, components in `components.js`; component names are `rana`, `interview`, `ranaTip`, `progress`/`levelBar`/`liftBar`/`restRow`/`stepsBar`/`topbar`, `optionGroup` (cards, tiles, checkboxes), `chipGroup`, `stepChips`, `field`, `setRow`/`setTable`. See the header of each file.)
  - Each returns an element and sets the correct ARIA attributes (`role="progressbar"` + values, `aria-pressed`, `aria-expanded`, `aria-current`).
- **`js/core/page.js`:** the §4.3 boot.
- **`data.js`:** the session cache.
- **`nav.js`:** rewritten for Today / Plan / Progress / Profile with the new icons, drawn during boot.
- `assets/rana/` copied from the handoff.
- **Component gallery** `docs/redesign/components.html`: every component in every state. It's temporary (deleted in Phase 11) and is the visual check for this phase.

**Check:** the gallery matches `handoff/screenshots/tokens-and-components.png`; contrast holds; the 44 px hit areas measure right in DevTools; tests pass with the new paths.

### Phase 2: Domain layer (no UI)
**Delete:** the §5.1 deletions, `js/dashboard-state.js` (its useful pieces move to `progress.js`/`coach.js`; the `FIXTURE` fallback is gone, since boot redirects instead), quote loading code, `data/quotes.json`.

**Build:** §5.1–5.6: `normalizeProfile`, `starting_lifts`, the ledger extension with targets and bonus, `plan.mainLifts`, `progress.js`, `coach.js` with `COACH_RULES` and the §11 templates, and the tests.

**Docs:** update `docs/leveling-system.md`: add the target bonus and remove stats, recovery and banner wording.

**Check:**
- All tests pass, including sections 8–9.
- The Phase 0 fixture's XP total is unchanged when no targets are hit.
- Report the new Level-50 timing.

### Phase 3: Questionnaire (`onboarding.html`, `js/pages/onboarding.js`, `js/core/questions.js`)
**Delete:** all per-question markup in `onboarding.html` and the index-based `validate` switch.

**Build:**
- **`questions.js`:** an array of 15 definitions `{ id, type: "text"|"number"|"single"|"multi"|"days"|"weekdays"|"lifts", pose, prompt(profileSoFar), options, unit, min, max, optional, validate, skipIf(profileSoFar) }`.
  - Prompts come from §11.
  - `options` carries the label + description pairs from §11 (option cards need descriptions).
  - Order: name, gender, age, height, current weight, target weight (optional), goal, focus area, fitness level, activity, limitations, gym, training days, weekdays, **current lifts**.
  - Lifts uses `skipIf: never-trained` (D7). The counter reads "n of 15" (or "of 14" when lifts is skipped).
- **`onboarding.js`:** a generic renderer.
  - Header: back icon button, onboarding progress bar, "n of 15".
  - Interview row (pose plus bubble, with the name interpolated after Q1).
  - Answers by type.
  - Single choice auto-advances after ~250 ms, as now. Text/number/multi use the pinned primary Continue.
  - `history.pushState` per question, as now.
  - Question changes go through `Rana.ui.transition`.
- **The days question** uses number tiles with "Recommended" from `RECOMMENDED_DAYS`, plus the helper line.
- **The lifts question:**
  - compute `mainLifts` for the would-be plan (goal, days, limitations and weekdays are known by then);
  - show step chips (the current one in ink);
  - Weight + Reps fields (reps only for bodyweight lifts);
  - live "Estimated max" display 64 and the target line;
  - the primary button reads "Next: <lift>" and, on the last lift, "See my plan";
  - a text button "I haven't done this" skips the lift.
  - Validation: reps 1–30, weight 0–1000 with errors in the §11 wording.
- **`finish()`:** build the profile, including `starting_lifts` keyed by `exercise_key`, then the plan and saved plans (logic unchanged), then go to `plan-reveal.html`.

**Check:**
- Every question at 390 px vs `01/02/03` screenshots; back and forward through all 15; the browser back button works.
- A never-trained run skips lifts.
- The profile saved has numbers, not strings, and the `starting_lifts` keys match `mainLifts`.

**As built (Phase 3):** `js/core/questions.js` holds the 15 definitions (plus `active()`, `toProfile()`, `liftName()`, `liftLabel()`); `js/pages/onboarding.js` is the generic renderer; `css/pages/onboarding.css` is the page's small stylesheet. Differences from the text above:
- The weekday and limitation questions use the new `compact` option variant (two columns), not full-height cards.
- The lifts target line reads "Your first {lift} target will be {target} lb. You'll see it on your Progress page." (a "lift verb" can't be generated for every exercise). Bodyweight lifts say "...{target} reps in one set...".
- The weight error says "Enter a weight between 1 and 1,000 lb." (0 would make it a bodyweight lift). The skip button on the optional target weight is "Skip for now".
- The footer's room under the content is set per question by the script (`has-footer`, `has-footer--tall`), so auto-advancing questions reserve nothing.
- Lift chips use short sentence-case names ("Incline bench press").
- Tested on 127.0.0.1: all 15 questions, back/forward/browser-back (answers kept), a never-trained run (14 questions, no lifts, empty `starting_lifts`), validation messages, the saved profile and plan. Tests: section 11 of `scripts/test_leveling.js`.

### Phase 4: Plan reveal, sign-up, index
**Delete:** `results.html/.js` and `account-creation.html/.js` (rename via `git mv`, then rewrite), the stat/route/glow reveal code, `PHASE_INFO` HUD styling.

**Build:**
- **`plan-reveal.html`:**
  - Interview row (cheer, 124 px) and the split name in display 40.
  - Summary line: days and about N minutes, from `est_session_minutes`.
  - Week strip; session list card (name, `session_focus`, minutes); pinned primary **Start my plan**.
  - "Build your own plan" as a text button under the list (existing flow). When an own plan exists, a two-option choice above the button ("Start with Rana's plan / your plan"), as now.
  - **Below the fold**, under a quiet section heading each:
    - "Your first 12 weeks": the `forecastRoute` floor as "At least Level N by week 12" plus a simple phase track (calibration / build / deload weeks), with no tier names;
    - "Daily targets": calories and macros, with the calorie floor and rate guardrails unchanged;
    - the disclaimer.
  - Reveal: the bubble enters, then the content fades in once. There's no long sequence and no skip-tap needed.
  - Lock-in sets `start_date` exactly as today.
- **`sign-up.html`:** interview row (wave), email field (.edu rule unchanged), password field, primary Continue. The password is still never stored.
- **`index.html`:** `location.replace` routing (no profile → onboarding; draft → plan-reveal; else today). Keep the script without `defer` so it runs immediately; it's the one allowed exception.

**Check:** vs `04-plan-reveal.png`; lock-in works for Rana's plan and for an own plan; the calorie numbers match the old screen for the Phase 0 fixture.

### Phase 5: Today (`today.html`)
**Delete:**
- `dashboard.html/.js`, `session-detail.html/.js` (D1) and every link to `session-detail.html`;
- the vitals bar, status matrix, stat tiles, segmented bars, recovery and the quote.

**Build** (top to bottom):
- **Header:**
  - Date line (muted 16).
  - **Level N** in display 64 (the one bold element).
  - Level bar with "**1,840** / 2,156 XP" and "316 XP to Level 8".
  - Streak line with the flame icon (§11 copy, including the rest-day variant).
- **Week row** (D-component; tap a past day with a workout to open its summary).
- **Rana tip:** `coach.todayTip`.
- **Hero card**, by state:
  - **Training day (Rana's plan):** "Today's workout", the workout name (xl 28), the meta row (dumbbell icon + "N exercises", clock icon + "About N min"), then the exercise rows with sets × reps from the limitation-aware picks. Show the abs section as one muted row: "Abs (optional) · 2–3 sets". Then the primary **Start workout** and the text button **Do something else** (freestyle name sheet).
  - **Own-plan day:** the day name, "Your plan · add exercises as you go", **Start workout**.
  - **Rest day:** "Rest day", the §11 line, the secondary **Start a workout anyway**.
  - **In progress:** a resume card: the workout name, "Started 24 min ago · 7 sets logged", primary **Resume**, text button **Discard** (`Rana.ui.confirm`).
  - **Done today:** "Done for today", the workout name and XP earned, a secondary "See summary"; plus "Start another workout" as a text button (no session XP; rules unchanged).
  - **Limitations:** if a pick has a caution, show one muted line under that exercise row ("Go light: loads your knee").
- Tab bar with Today active.

**Check:** vs `05-home-today.png`, and each state forced via the fixture. The off-plan and missed states show in the week row.

### Phase 6: Workout logging (`workout.html`): the biggest phase, two commits
**Delete:** `active-session.html/.js` (rewrite from scratch, reusing only the storage calls), the per-slot card layout, the swap buttons, the old Log button flow.

**Commit 6a: structure.**
- **Header:** × icon button (leaves; D11); the workout name (16/700) over the elapsed time (14 muted, tabular, ticks every second from `started_at`); **Finish** text button.
- **Steps bar:** one segment per step. Each segment is a button (44 px tall hit area) that jumps to its step. A filled segment means at least one set is logged there.
- **Steps:**
  - Rana's plan: one step per slot, plus a final **"Abs (optional)"** step whose chips are `absOptions`.
  - Freestyle / own-plan: one step per added exercise, plus a trailing **"Add exercise"** step that opens the picker. An empty workout opens straight into an empty state: Rana tip "Add your first exercise" and the primary **Add exercise**.
  - Remove-exercise stays available until a set is logged (existing rule), as a text button.
- **Step content:**
  - Title = the movement pattern (xl 28) for slots, the exercise name for freestyle.
  - The prescription line (`Rana.ui.prescription` with RPE (i) and rest).
  - **Option chips** from `slot_options`, limitation-aware order. The selected chip is the exercise being logged; switching shows that exercise's own set table. A caution note appears under the chips when the pick conflicts.
- **Set table:**
  - Columns: Set · Last time · lb · Reps · Done.
  - Prescribed rows count = `working_sets`. "Add set" appends rows (D10).
  - The weight is pre-filled from `coach.suggestion`; reps are empty with the top of the range as placeholder.
  - The active row (first not done) is white.
  - **The done toggle:**
    - validates (reps 1–30, weight required unless bodyweight, with inline danger messages);
    - writes the set immediately with `addLoggedSet`;
    - locks the row to plain text.
  - **Un-toggling** deletes that set (`deleteLoggedSet`) and unlocks the row.
- **Pinned footer:** primary **Next: <next step name>**. On the last step it reads **Finish workout**.
- **Finish:**
  - Under half the prescribed sets (or under 3 for freestyle/own): `Rana.ui.confirm` with today's wording.
  - Then the difficulty sheet: "How hard was that?" 1–5, labelled 1 = easy and 5 = all-out.
  - Then `finishSession` → `workout-summary.html`.
- **Resume:** reopening restores the step with the first unfinished slot and every logged set.

**Commit 6b: coaching and helpers.**
- **"Last time" column:** `progress.lastTime`, showing "—" when there's none.
- **Rana tip** (36 px avatar) per step: `coach.suggestion(...).text`.
- **"How to do it" collapsible**, closed by default:
  - "Video coming soon" box (ink, 172 px, play glyph, caption "Video coming soon").
  - Muscles worked: the primary chip on accent (`target_muscle_primary`); secondary chips on chalk (`target_muscle_secondary` split on `;`).
  - Coaching cue: the slot's `coaching_cue`, falling back to the exercise's.
  - Tempo line: "Tempo 3-1-1-0: 3 s down, 1 s pause, 1 s up". Generate it with a formatter, never hand-written.
- **Rest timer:**
  - Marking a set done saves `rest_started_at`/`rest_seconds` (slot `rest_seconds`, or 120 for freestyle) on the session.
  - The footer row shows the timer icon, "Rest 1:42" bold, an ink bar and "2:30" muted.
  - It survives reload because it's computed from the timestamp.
  - At zero it reads "Rest done" and calls `navigator.vibrate(200)` if available. No sound, no notifications.
  - Marking the next set done restarts it. A small text button "Skip rest" clears it.

**Check:**
- vs `06` and `07` screenshots.
- A full suggested workout logged through every step, including a swap, an extra set, an un-toggle, abs, reload mid-rest and resume.
- A freestyle and an own-plan workout from empty.
- The XP afterwards matches the rules; tests pass.

### Phase 7: Workout summary (`workout-summary.html`)
**Delete:** `session-complete.html/.js` (rewrite), the flash, the NEW RECORD / MAX GAIN / ADHERENCE visuals, the tier "transformation" card, the segmented level bar.

**Build:**
- **Header:** "Workout done", or the workout name in logbook mode.
- **Interview row** (cheer when a target, level-up or new best happened, otherwise wave), using `coach.summaryLine`.
- **The bold element:** "+245 XP" in display 64, counting up once.
- **XP lines** landing one at a time (`--dur-base` apart):
  - "Workout completed +100"
  - "Streak bonus · 6 in a row +30"
  - "New best: Barbell bench +4% +40"
  - "**Target hit: Barbell bench 200 lb +500**"
  - "Rest day: strength XP only" (as an explanation line).
- **Level bar** (level variant) filling from before to after. A level-up says "Level 8" in the bubble. A tier change adds one quiet line: "New milestone on your Profile: Awakened".
- **Recap list card:** each exercise with its sets as "140 × 8"; a "Best" tag on new bests.
- **Logbook mode** (`?from=history`): the final state with no animation. **Edit** (fix weight/reps, remove a set with Undo, delete the workout) works exactly as now, restyled, through `Rana.ui.confirm`.
- **Tap anywhere to skip.** Reduced motion shows the final state.

**Check:** a target-hit workout shows the +500 line and the cheer; editing the hitting set away removes it; logbook mode has no animation.

### Phase 8: Progress (`progress.html`) and History
**Build:**
- **`progress.html`:**
  - Title "Progress" and the Rana tip (`coach.progressTip`).
  - **Strength hero card**, one row per main lift:
    - name plus current value (display 40);
    - lift bar from start to target;
    - "Started at X" · "+N lb" (accent-strong) · "Target Y";
    - calibrating rows: "Finding your starting weight · 2 of 3 sessions" with no bar;
    - not-logged rows: "Not logged yet".
  - **Level history:** `weeklyXp` as 5 bars with level labels, date labels and an `aria-label` per bar.
  - **Recent workouts:** a list card of the last 3 (name, date, XP) plus **See all** → `history.html`.
- **`history.html`:** rewrite (the same data and month grouping as now, in list cards). The tab bar shows Progress active. Rows open `workout-summary.html?…&from=history`.
- **Delete:** the old history page script/CSS.

**Check:** vs `08-progress.png` using the fixture; a skipped lift shows calibrating, then gets a target after 3 sessions.

### Phase 9: Plan tab, plan builder, Profile
**Delete:** `my-plan.html/.js` and `account.html/.js` (rename and rewrite), the old builder styles.

**Build:**
- **`plan.html`** (tab Plan): the active plan first.
  - Title, week strip, and a session list whose rows expand to show that day's exercises, sets × reps and the abs line. This replaces session detail's browsing role.
  - Then the other plan as a smaller card with **Set active** (`activatePlan`; the switch-date rules are unchanged, and the effective date shows as today).
  - Own-plan actions: Edit and Delete (only while not active).
- **`plan-builder.html`:** same logic, restyled with option cards per weekday (Rest / Training plus a name field with quick-name chips).
- **`profile.html`** (tab Profile):
  - Name, **Level N**.
  - The **milestones row**: the 6 tiers, the current one highlighted, "Next: Ascended at Level 22".
  - Earned titles as a quiet list.
  - Email; Sign out (disabled, "Coming with real accounts").
  - "Your answers": every question from `questions.js` with Edit, using the same renderer components as the questionnaire. Goal and day changes still re-pick Rana's plan after a confirm, as now.
  - "Starting lifts": each main lift's answer, editable. Edits change the derived targets on the next replay.

**Check:** plan switching keeps past XP identical (test section 7 still passes); Profile edits round-trip; the milestones are correct for the fixture's level.

### Phase 10: Sweep, accessibility, motion, end-to-end
- Run the §9 grep checklist. Every item must return nothing.
- Delete any file no page loads: list every `.js`/`.css` and grep for its `src`/`href`.
- Accessibility pass on every screen:
  - tab order;
  - focus visible;
  - `aria-label` on icon buttons;
  - progressbars report values;
  - 44 px hit areas;
  - contrast holds (tokens already pass, so check custom combinations).
- Motion pass (§6.9) across the whole flow, with and without reduced motion.
- **End-to-end on 127.0.0.1, at 390 px and 1280 px:**
  1. questionnaire (returning lifter, with lifts);
  2. plan reveal → sign-up → Today;
  3. log a full workout;
  4. summary;
  5. Progress;
  6. History → logbook → edit;
  7. Plan → build own plan → set active → own-plan workout;
  8. Profile edit goal → plan re-picked;
  9. then a never-trained run.
  Zero console errors.
- Migration check (§5.6) against an old-shape fixture.

### Phase 11: Docs, cleanup, merge
- **Rewrite `CLAUDE.md` as a current-state document** (what the app is, the architecture in §4, the rules, the decisions, and what's left). The dated changelog entries are history; git keeps them. Cut it to what a new session needs. `AGENTS.md` is a symlink, so leave it.
- **Rewrite the locked decisions:**
  - #2 and #3 per D1 (browsing never starts a workout; the Today card and Plan tab are the preview).
  - #8 adds the target bonus.
  - #9 becomes "Rana is the coach character, drawn from Brennan; original naming; no borrowed characters". The Stoic-quote rule goes away with D2.
- **Superseded sections:**
  - note that PRD §10 is superseded by the handoff (summarized in CLAUDE.md);
  - add a "superseded" header line to `rana-prd-v1-910` §10 and §7.4 (stats).
- Update the memory files `redesign-rana-coach.md` (mark BUILT) and `stats-start-at-zero.md` (stats retired).
- **Remind Brennan:** per-exercise history is the next agreed feature, and `progress.lastTime` and `ledger.lifts[key].history` are its foundation.
- Delete `docs/redesign/` (including the gallery). Keep `assets/rana/`.
- Ask Brennan before merging `redesign` into `main` and before pushing.

---

## 8. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| A big rewrite breaks existing data | Same storage keys; normalization on read; the §5.6 fixture check; XP regression vs the Phase 0 baseline |
| Old pages are broken mid-branch | Expected; screens are rebuilt in flow order (onboarding → reveal → sign-up → today → workout → summary), so the main flow works from Phase 6 on |
| XP balance shifts from the +500 bonus | Measured in Phase 2 and reported, not silently retuned |
| View Transitions aren't supported in a browser | They're progressive: unsupported browsers navigate normally |
| Sonnet drifts from the design | Every phase checks against a named screenshot; the component gallery locks the parts |
| Coaching rule numbers are wrong | All in `COACH_RULES` / `XP_RULES`, flagged to Brennan |

---

## 9. Leftover checklist (Phase 10: each grep must return nothing outside `docs/` and `scripts/`)

```
grep -rn "clip-path\|Chakra\|Barlow\|glow\|text-shadow" --include=*.css --include=*.html --include=*.js .
grep -rn "computeStatPoints\|computeProjectedStats\|statValue\|statYield\|computeRecovery\|FIXTURE\|SEGMENTS" --include=*.js .
grep -rn "NEW_RECORD\|MAX GAIN\|ADHERENCE\|quotes.json\|session-detail\|dashboard.html\|account.html\|results.html\|active-session\|session-complete\|my-plan.html\|account-creation\|styles.css" --include=*.js --include=*.html .
grep -rn "window.confirm\|alert(\|prompt(" --include=*.js .
grep -rln "function el(" --include=*.js . | grep -v js/core/ui.js
grep -rn "STR\b\|AGI\b\|VIT\b" --include=*.js --include=*.html .
```

Also: no emoji in the UI, no all-caps labels, and no `box-shadow` except the input focus ring.

---

## 10. Order of sessions (suggested)

Run each line in a fresh Sonnet session, starting from: "Execute Phase N of docs/redesign/PLAN.md."

1. Phase 0 + Phase 1
2. Phase 2
3. Phase 3
4. Phase 4 + Phase 5
5. Phase 6 (6a, then 6b)
6. Phase 7 + Phase 8
7. Phase 9
8. Phase 10 + Phase 11

---

## 11. Rana's lines (DRAFT: Brennan edits this section before Phase 3)

Rules: first person, plain words, no emoji, no all-caps. Tips are under ~90 characters and always name a weight, reps or an exercise. `{name}` etc. are filled in by code.

### Questionnaire (pose · bubble · options with descriptions)

1. **Name** · wave · "Hey, I'm Rana. I'll be your coach. What should I call you?"
2. **Gender** · neutral · "Nice to meet you, {name}. Which fits you? I use it for your calorie targets."
   - Options: keep the current gender options exactly as they are in `onboarding.html`.
3. **Age** · neutral · "How old are you?"
4. **Height** · neutral · "How tall are you?" (cm)
5. **Current weight** · neutral · "What do you weigh right now? A rough number is fine." (lb)
6. **Target weight** · think · "Got a weight you're aiming for? Skip this if not." (lb, optional)
7. **Goal** · wave · "Okay {name}, the big one. What are you training for right now?"
   - Build muscle: "Add size and definition"
   - Lose fat: "Lean out and keep your strength"
   - Get stronger: "Move more weight on the big lifts"
   - General fitness: "Feel good and stay consistent"
   - Footer: "You can change this later in Profile."
8. **Focus area** · think · "Anything you most want to bring up?"
   - Chest & arms: "Bigger press, fuller arms"
   - Back & shoulders: "Wider back, rounder shoulders"
   - Legs & glutes: "Stronger, bigger lower body"
   - Balanced: "A bit of everything"
9. **Fitness level** · think · "Be honest with me. How much have you lifted before?"
   - Never trained: "New to the weight room"
   - Trained before, returning: "Lifted before, getting back into it"
   - Training consistently: "Lifting regularly right now"
10. **Activity** · neutral · "Outside the gym, how much are you on your feet?"
    - Mostly sitting: "Classes, desk, screens"
    - Moderately active: "Walking around campus most days"
    - On my feet all day: "A job or sport keeps me moving"
11. **Limitations** · think · "Anything that hurts that I should work around? I'll pick exercises that go easy on it."
    - Knee / Shoulder / Lower back / Wrist / None of these
12. **Gym** · neutral · "Where do you usually train? Any of these works. Every exercise has swaps."
    - Rec center: "Your campus gym"
    - Commercial gym: "A chain or local gym"
    - Apartment gym: "A small gym where you live"
13. **Days** · think · "How many days a week can you actually get to the gym?"
    - Helper: "{recommended} days suits {level phrase}. Pick what fits around your classes; any option works."
14. **Weekdays** · think · "Which {n} days work best around your classes?"
15. **Current lifts** · neutral:
    - Weighted: "What's a recent {lift} set you did with good form?"
    - Bodyweight: "How many {lift}s can you do in one good set?"
    - Target line: "Your first {lift} target will be {target} lb. You'll see it every time you {lift verb}."
    - Skip button: "I haven't done this"
    - Errors: "Enter reps between 1 and 30." / "Enter a weight between 0 and 1,000 lb."

### Plan reveal
- Bubble (cheer): "You're set, {name}. This is the plan I'd pick for {goal phrase} on {n} days."
  - Goal phrases: building muscle / losing fat / getting stronger / general fitness.
- Route heading: "Your first 12 weeks" · floor line: "At least Level {n} by week 12 if you show up."
- Targets heading: "Daily targets"

### Sign-up
- Bubble (wave): "Last step. Use your school email so your progress is saved."

### Today
- Streak: "**{n}-workout streak.** Today keeps it going." · rest day: "Rest day. Your streak is safe." · no streak: "Today starts your streak."
- Rest-day line: "Rest today. Next up is {workout} on {weekday}."
- First workout ever: "Your first {workout} is today. Go light and learn the moves."

### Coach suggestions (logging step tip; Today uses the first actionable one)
- add: "Add {inc} lb to your {exercise} today. You hit all {top} reps on every set last time."
- add (bodyweight): "You hit {top} reps on every set of {exercise}. Try adding {inc} lb today."
- hold-reps: "Stay at {weight} lb on {exercise} and go for one more rep per set."
- hold-missed: "Keep {exercise} at {weight} lb today. A few sets came up short last time."
- drop: "Drop {exercise} to {weight} lb and build back up. It's stalled two sessions in a row."
- hold-hard: "Last {workout} felt all-out. Keep the same weights today and own every rep."
- first-time: "First time on {exercise}? Find a weight you could lift for {top} reps with 2 left."
- calibrating: "Still finding your {exercise} weight. Try {weight} lb and see how the reps feel."
- freestyle empty: "Add your first exercise. I'll keep track of your sets."

### Workout summary (bubble)
- Target hit: "That's your {exercise} target: {value} lb. Next one is {next} lb."
- Level up: "Level {n}. Showing up is paying off."
- New best: "New best on {exercise}. That's what we're here for."
- Plain: "Logged. {sets} sets in {minutes} minutes."
- Rest day: "Good work. Today was a rest day, so it's strength XP only."

### Progress
- Fastest lift: "Your {exercise} is up {n} lb in {weeks} weeks. That's your fastest lift right now."
- Nearest target: "{gap} lb to go on your {exercise} target."
- Empty: "Log a few workouts and I'll show you where you're getting stronger."

### Errors and empty states
- Load error: "Something didn't load. Reload and I'll try again."
- No history: "No workouts yet. Your first one shows up here."
