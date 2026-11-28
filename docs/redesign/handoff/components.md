# Rana components

Every value below matches the mockups in `mockups/` exactly. Token names refer to `tokens.css`. Build each one once (CSS class plus, where useful, a helper in `ui.js` next to `Rana.ui.confirm` and `Rana.ui.numericField`) and reuse it everywhere.

Global rules:

- No gradients, glows, blur/glass, or drop shadows. The only `box-shadow` in the app is the input focus ring.
- No emoji anywhere in the UI. Icons are line icons (see Icons).
- One bold, data-forward element per screen. Everything else stays small and quiet.
- Sentence case everywhere. No all-caps labels, no arrows appended to button text.
- Every tappable thing is a real `<button>` or `<a>` with at least a 44 × 44 px hit area.

---

## Rana (the character)

Files: `assets/rana/rana-wave.svg`, `rana-think.svg`, `rana-cheer.svg`, `rana-neutral.svg`, `rana-avatar.svg`.

- The full poses use a 200 × 220 viewBox and show him from the waist up. Scale them with width only (`height: auto`).
- The avatar is a 120 × 120 circle crop on an accent-soft background.
- The illustration is decorative next to the speech bubble, so use `alt=""` (or `aria-hidden="true"` if inlined).
- Never mirror, recolor, stretch, or crop him mid-face.

| Pose | Where it's used |
|---|---|
| wave | First onboarding question, greetings, empty states |
| think | Onboarding questions that need a decision (days, limitations) |
| neutral | Onboarding inputs (current lifts) |
| cheer | Plan reveal, level-up, new personal best |
| avatar | Coaching tips on every other screen: 44 px; 36 px during a workout |

Suggested helper: `Rana.ui.rana(pose, widthPx)` that returns an `<img>` for the right file.

## Speech bubble

Two variants, one per screen at most.

**Interview** (onboarding, plan reveal)

- Layout: a row with `align-items: flex-end` and a 10 px gap. Rana comes first at 116 px wide (124 px on plan reveal), with an 8–10 px negative left margin so he sits close to the edge. The bubble takes the remaining width.
- Bubble: `--color-surface` fill, 1 px `--color-line` border, `--radius-xl` (24), padding 16 × 18. It has a bottom margin of 56 px, which lifts it so the tail lines up with Rana's face.
- Text: `--text-lg`/26, weight 600, `text-wrap: pretty`. If the line runs past about 80 characters, drop to 16/22 at weight 500 (as on plan reveal).
- Tail: a 14 × 14 square with surface fill, `border-left` and `border-bottom` 1 px line, `transform: rotate(45deg)`, `position: absolute; left: -8px; bottom: 22px`.

**Tip** (home, logging, progress)

- Layout: a row with `align-items: flex-start` and a 12 px gap (10 px in a workout). The avatar is 44 px (36 px in a workout).
- Bubble: surface fill, 1 px line border, `--radius-md` (16; 14 is fine at 36 px), padding 10 × 14 (8 × 12 in a workout).
- Text: `--text-sm`/20, weight 400. Under about 90 characters, and always specific: a weight, a rep count, or an exercise name. Example: "Add 5 lb to your incline bench today. You hit all 8 reps on every set last time."
- Tail: a 12 × 12 square, same construction, `left: -7px; top: 15px` (13 px in a workout), so it points at the avatar's mouth.
- Motion: when an interview question changes, the bubble fades in and rises 8 px over `--dur-base` with `--ease-out`. Nothing else animates on that screen.

## Progress bar

Always use `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and an `aria-label`. Always show the numbers as text; the bar alone is never the only signal. The fill animates `width` over `--dur-base` only when the value changes.

| Variant | Height | Track | Fill | Notes |
|---|---|---|---|---|
| Level (home) | 10 px | `--color-line` | `--color-accent` | Under it, a 14/20 row with `space-between`: "**1,840** / 2,156 XP" on the left (the current number bold, the rest muted) and "316 XP to Level 8" muted on the right. |
| Lift (progress) | 6 px | `--color-track-soft` | accent | The bar spans start → target. Fill % = (current − start) ÷ (target − start). Under it: "Started at 175" muted, "+10 lb" in accent-strong 700, "Target 205" muted. |
| Rest timer | 6 px | line | `--color-ink` | Ink, not accent, so it never reads as progress toward a goal. Row: timer icon, "Rest 1:42" bold, bar, "2:30" muted. |
| Steps | 4 px segments, 4 px gap | line | accent | Exercise n of 6 in a workout: a grid of 6 equal columns. |
| Onboarding | 6 px | line | accent | Sits between the back button and an "n of 15" label (14/20 muted, tabular). |

Level math is unchanged from `docs/leveling-system.md`: XP to reach level n = 44 × (n − 1)².

## Buttons

| Type | Spec | Example |
|---|---|---|
| Primary | 56 px tall, `--radius-full`, accent fill, ink text 16/700, full width. One per screen, at the bottom with 24 px side margins. Pressed: `--color-accent-pressed`. Disabled: `--color-line` fill, muted text. | Start workout, Next: pull-up, Start my plan |
| Secondary | 56 px (44 px compact), surface fill, 1 px line border, ink 16/600. Use it for the quieter path. | Start a workout anyway (rest day) |
| Text | 44 px hit area, no fill. Either ink 16/600 underlined (offset 3 px) for opt-outs, or accent-strong 16/700 for header actions. | I don't bench yet, Finish |
| Icon | 44 × 44, transparent, 24 px glyph in ink. `aria-label` required. | Back, Exit workout |

Focus (all types): `outline: 2px solid var(--color-ink); outline-offset: 2px` on `:focus-visible`.

Text on the accent is always ink (7.8:1). Never put white text on marigold.

## Cards

- **Hero card:** surface fill, `--radius-xl` (24), padding 20, no border, no shadow. Use at most one per screen (Today's workout on home, Strength on progress).
- **List card:** surface fill, `--radius-lg` (20), padding 4 × 18. Rows have 12 px vertical padding with a 1 px `--color-divider` between them (none after the last row). Each row has a title (16/22, 600) and a muted subtitle (14/20), with the right-side value muted 14.
- **Option card** (onboarding single choice): a `<button role="radio">` with min-height 72, `--radius-lg`, 1 px line border, padding 14 × 18. It holds the label (16/22, 600), a muted description (14/20), and a 22 px radio circle on the right (1.5 px border `#B9BBB2`).
  - Selected: 2 px accent border (reduce padding by 1 px so nothing shifts), `--color-accent-wash` fill, and the circle becomes a filled accent dot with an ink check.
  - Single-choice questions still auto-advance after a short pause, as in `onboarding.js` today.
- **Number tile** (days per week): the option card in a 2 × 2 grid, 128 px tall. It shows a big number (display font 40/40, 700), "days" (16/600), and an optional "Recommended" tag at the bottom (12/16, 600, accent-strong). It uses the same selected state, with the check in the top-right.
- **Collapsible** ("How to do it" in logging): surface fill, `--radius-md`. The header is a full-width `<button aria-expanded>` at least 60 px tall. It holds a 36 px chalk circle with a play icon, a title (16/600), a muted subtitle (14), and a 22 px chevron that rotates 180° over `--dur-fast`.
  - The body (padding 0 14 16, 14 px gap) holds:
    - a 16:9 video box (172 px tall, `--radius-sm`, ink background, white play button 52 px, caption and duration in white 14 px)
    - "Muscles worked" with chips: primary muscle on an accent fill, secondary muscles on a chalk fill, all 28 px tall at 14 px
    - the coaching cue (14/21)
    - the tempo line, muted.
  - The body pushes the set table down; it never overlays it.

Everything that isn't a card sits straight on chalk. If two cards next to each other look identical, one of them should be a list instead.

## Inputs

- **Number field, onboarding:** label above (14/20, 600). The field is 60 px tall, `--radius-md`, surface fill, 1 px line border, horizontal padding 16. The value is 20 px/700, tabular. A unit suffix ("lb") sits inside on the right, muted 16.
- **Number field, set row:** 48 px tall, `--radius-sm`, centered value 20/700 tabular, surface fill with a 1 px line border. Once a set is marked done, its inputs drop the border and fill (transparent) so logged numbers read as plain text.
- **States:**
  - Focus: 2 px ink border plus `box-shadow: 0 0 0 3px var(--color-accent-soft)`.
  - Error: 2 px `--color-danger` border and a 14/20 danger message under the field that says how to fix it ("Enter reps between 1 and 30.").
- **Behavior:** keep using `Rana.ui.numericField`: digits only, `inputmode` numeric/decimal, no spinners or scroll-wheel changes.
- **Chips** (exercise options in a slot): 40 px tall, `--radius-full`, padding 0 16, 16/600 text, 1 px line border on surface. The selected chip gets a 2 px accent border and a wash fill. The row scrolls horizontally and bleeds off the right edge of the screen.
  - A solid ink chip (white text, 32 px tall, 14/600) is used only to mark the current step, such as Bench press / Squat / Deadlift in the lifts question.
- **Done toggle** (set rows): a 44 × 44 button with a 30 px circle inside. Not done: 1.5 px `#B9BBB2` border, empty. Done: accent fill with an ink check. `aria-pressed` reflects the state.

## Set table (workout logging)

- Header row: 12/16, 600, muted. Columns: Set · Last time · lb · Reps · Done.
- Grid: `32px minmax(0,1fr) 80px 64px 44px`, 8 px gap.
- Rows have a min-height of 56 and a 6 px gap between them. The active row (the first set not done) gets a white fill with `--radius-md`. Done rows and future rows sit on chalk.
- The set number is 16/700 centered. "Last time" shows the previous session's weight × reps, muted 16 tabular.
- "Add set" sits below the table as a text button with a plus icon.

## Tab bar

- Fixed to the bottom, 84 px tall (this includes the home-indicator area), surface fill, 1 px line top border.
- Four equal columns, each a 24 px icon over a 12/16 label, with 8 px top padding.
- The active tab is ink at weight 700 with `aria-current="page"`. Inactive tabs are muted at 600.
- Tabs: Today, Plan, Progress, Profile. See the open decision about History in the README.

## Icons

Use [Lucide](https://lucide.dev) at 24 px with `stroke-width: 1.75`, round caps and joins, and `currentColor`. The mockups use hand-drawn equivalents of these:

| Use | Lucide name |
|---|---|
| Today tab | `house` |
| Plan tab | `calendar` |
| Progress tab | `chart-column` |
| Profile tab | `user` |
| Streak | `flame` (accent-strong) |
| Exercise count | `dumbbell` |
| Duration | `clock` |
| Rest timer | `timer` |
| Tutorial / video | `play` |
| Back | `chevron-left` |
| Expand / collapse | `chevron-down` |
| Exit workout | `x` |
| Add set | `plus` |
| Done / selected | `check` (stroke 3 at 14–16 px) |
