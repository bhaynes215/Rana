# Rana screens

Each screen has a screenshot in `screenshots/` (390 × 844 at 2x) and a static HTML version in `mockups/`. Open the mockup in a browser to inspect exact values. The mockups are visual reference only: build the real screens from the repo's existing pages and logic.

Shared layout for every phone screen:

- Chalk background.
- 24 px side margins, with content starting 52 px from the top. Leave the status-bar area empty; never draw a fake status bar.
- The primary button is pinned to the bottom (32 px above the bottom edge, or above the tab bar).

The sample data comes from the real repo (`data/*.json`, `docs/leveling-system.md`) for an Upper/Lower lifter at Level 7.

---

## 1. Onboarding questionnaire → `onboarding.html`

Three sample questions are shown. Apply the same pattern to all 14 existing questions plus the new lifts question.

**Header (all questions):** back icon button, the onboarding progress bar, and "n of 15" (14 existing questions + 1 new).

**Interview row:** Rana and the speech bubble, with the question written in his voice. Below that come the answers.

### 1a. Main goal (`01-onboarding-goal`)
- Rana: wave.
- Bubble: "Okay Brennan, the big one. What are you training for right now?" The name comes from the first question.
- Four option cards, each with a description:
  - Build muscle: "Add size and definition"
  - Lose fat: "Lean out and keep your strength"
  - Get stronger: "Move more weight on the big lifts" (shown selected)
  - General fitness: "Feel good and stay consistent"
- Footer line, centered muted 14: "You can change this later in Profile."

### 1b. Training days (`02-onboarding-days`)
- Rana: think.
- Bubble: "How many days a week can you actually get to the gym?"
- 2 × 2 number tiles for 3, 4, 5 and 6 days. Show "Recommended" on the counts that `RECOMMENDED_DAYS` returns for the user's fitness level.
- A muted 14 px helper under the grid: "3 or 4 days suits lifters getting back into training. Pick what fits around your classes; any option works."

### 1c. Current lifts (`03-onboarding-lifts`) — new question
- Rana: neutral.
- Bubble: "What's a recent bench set you did with good form?"
- Step chips: Bench press (current, ink) · Squat · Deadlift. This is one question asked three times.
- Weight (lb) and Reps number fields side by side.
- Bold element: "Estimated max" with a **175 lb** display number (64 px), computed live with the app's existing estimated-1RM formula, weight × (1 + reps ÷ 30). Under it: "Your first bench target will be 205 lb. You'll see it every time you bench."
- Primary "Next: squat" (on the last lift: "See my plan"), and a text button "I don't bench yet" that skips that lift.

## 2. Plan reveal (`04-plan-reveal`) → `results.html`
- Rana: cheer, with the bubble "You're set, Brennan. This is the plan I'd pick for getting stronger on 4 days."
- Split name in display 40: "Upper / Lower". Muted line: "4 days a week, about 55 minutes each".
- Bold element: the week strip, a 7-column grid with the day name (12/600 muted) above a 92 px block.
  - Training days: accent fill with the workout name in two lines (12/16, 700), e.g. "Upper" / "A".
  - Rest days: a 1.5 px dashed outline with "Rest" (12, muted).
- List card of the sessions: name, focus, and minutes, from `data/workouts.json`.
- Primary "Start my plan".
- This replaces the current results page's stat panels, 12-week route, and glow. See the open decision in the README about what to keep.

## 3. Home / today (`05-home-today`) → `dashboard.html`
- Date line, muted 16.
- Bold element: "Level 7" in display 64, then the level progress bar with "1,840 / 2,156 XP" and "316 XP to Level 8".
- Streak line: flame icon, then "**6-workout streak.** Today keeps it going." On a rest day: "Rest day. Your streak is safe."
- Rana tip (avatar 44): e.g. "Add 5 lb to your incline bench today. You hit all 8 reps on every set last time."
- Hero card "Today's workout":
  - Workout name (xl 28).
  - Meta row: dumbbell icon + "6 exercises", clock icon + "About 60 min".
  - Each exercise with its sets × rep range (15/28 rows, the right side muted and tabular).
  - Primary "Start workout".
- Rest day / Resume / Discard states keep their current logic. Restyle them with the components: secondary "Start a workout anyway", and the Resume and Discard buttons.
- Tab bar with Today active.

## 4. Workout logging (`06-workout-logging`, `07-workout-logging-tutorial-open`) → `active-session.html`
- Header row: an "Exit workout" icon button (x); in the center, the workout name (16/700) over the elapsed time (14 muted, tabular); on the right, a "Finish" text button (accent-strong).
- Steps bar: exercise n of N.
- Movement pattern as the title (xl 28), e.g. "Incline press". Under it, the prescription (14 muted): "3 sets of 6–8 reps, RPE 8, rest 2:30".
- Exercise option chips for the slot, from `slot_options`. Picking one swaps the exercise in place.
- "How to do it" collapsible, closed by default: video, muscles worked, coaching cue, tempo.
- Rana tip (avatar 36): e.g. "Add 5 lb today. You hit every rep last time."
- Bold element: the set table (see components.md). Then "Add set".
- Pinned footer (104 px, chalk background): the rest-timer row, then the primary "Next: <next exercise>" ("Finish workout" on the last slot).
- `07` shows the same screen with the tutorial open. The set table moves down and the screen scrolls.

## 5. Progress (`08-progress`) → new `progress.html`
- Title "Progress" (xl 28).
- Rana tip: e.g. "Your squat is up 20 lb in five weeks. That's your fastest lift right now."
- Bold element: the Strength hero card, headed "Strength" with "Estimated max, lb" on the right. Four rows: Bench press, Squat, Deadlift, Overhead press. Each row has:
  - the name (16/600) and the current estimated max (display 40, tabular)
  - the lift progress bar
  - "Started at X" · "+N lb" · "Target Y".
- Sample values: 175→185→205, 225→245→275, 280→295→335, 105→115→125.
- Level history: weekly XP as 5 bars (max 68 px tall, `--radius-xs`).
  - Past weeks use `--color-chart-bar`; the latest week is ink.
  - A 12/700 label sits above any week where a level was reached ("Level 5"), with the week date under each bar.
  - Each bar has an `aria-label` like "Week of Nov 2: 420 XP, reached Level 5".
- Tab bar with Progress active.

## Screens not mocked up

`session-complete.html`, `history.html`, `session-detail.html`, `account-creation.html`, `index.html`: restyle them with the same tokens and components. On session complete, use Rana cheer for level-ups and new bests. Replace the screen flash, NEW RECORD banner and combo text with a calm summary: the XP lines landing one at a time is fine.
