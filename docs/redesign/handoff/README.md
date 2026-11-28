# Rana visual redesign: handoff for Claude Code

**For Claude Code.** This folder is the new look for Rana. It keeps every mechanic (questionnaire, split matching, movement-pattern slots, XP and levels, streaks, current vs target) and replaces the dark "system HUD" skin with a warm, light, minimal one. Rana, a cartoon trainer based on Brennan, talks to the user through speech bubbles.

Brennan is new to coding. Make the changes in small steps, explain non-obvious choices in plain words, and update CLAUDE.md's "Current status" as you go, as the repo already does.

## What's in here

| Path | What it is |
|---|---|
| `tokens.css` | All design tokens as CSS variables (color, type, spacing, radius, sizes, motion) and the Google Fonts link. |
| `components.md` | Exact specs for Rana, speech bubbles, progress bars, buttons, cards, inputs, the set table, the tab bar and icons. |
| `screens.md` | Screen-by-screen layout and copy, and which repo file each screen maps to. |
| `assets/rana/*.svg` | The character: `wave`, `think`, `cheer`, `neutral` (200 × 220) and `avatar` (120 × 120 circle). |
| `screenshots/*.png` | Every screen at 390 × 844 (2x), plus the character sheet and the token sheet. |
| `mockups/*.html` | Static HTML of each screen. Open them in a browser to inspect exact CSS values. They are reference only; don't copy them into the app wholesale. |

## The look in one paragraph

- **Colors:** a calm chalk-grey background (`#EFF0EB`), white surfaces, near-black ink (`#24211D`, the same as Rana's tank top), and one accent, marigold (`#F4A51C`), used only as a fill. Text on marigold is always ink.
- **Type:** Bricolage Grotesque for screen titles and the one big number on each screen; Figtree for everything else.
- **Style:** no gradients, glows, glass, or drop shadows, and no emoji. Lucide line icons only.
- **Language:** plain app wording: "Today's workout", "Start workout", "Level 7".

## Suggested order of work

1. **Tokens and fonts.** Swap the `:root` block at the top of `styles.css` for `tokens.css`, and replace the font `<link>`s in every page. The `--space-*` names are unchanged. Remove the notched `clip-path` corners, segmented stat bars, and HUD glows as you reach each component.
2. **Components.** Build each piece in `components.md` once: CSS classes, plus helpers in `ui.js` (for example `Rana.ui.bubble`, `Rana.ui.rana(pose, size)`, `Rana.ui.progress`). Copy `assets/rana/` into the repo (for example `assets/rana/`).
3. **Screens, one per commit:** onboarding → results (plan reveal) → dashboard (home) → active-session (logging) → new progress page → the screens that weren't mocked up.
4. **Check each screen** in the browser at 390 px wide against its screenshot, then at desktop width. The existing wide-screen layouts can stay; just apply the new styles.
5. **Run `node scripts/test_leveling.js`** after touching anything near `game.js`. The redesign shouldn't change any numbers.

## Open decisions: ask Brennan before building these

1. **Game wording.** The brief says no fantasy or RPG wording and no game-style UI. The app still has tier names (Spark, Ignition, Awakened, Ascended, Transcendent, Mythic), earned titles (The Unbroken, Limit Breaker…), and NEW RECORD / MAX GAIN / ADHERENCE ×1.35 text. The new design only shows "Level 7". Should those be removed, renamed, or kept?
2. **STR / AGI / VIT stats.** They don't appear in the new screens. Keep them somewhere (Profile? Progress?) or retire them?
3. **Current-lifts question.** This is new: bench, squat and deadlift, entered as a recent weight × reps. How should each lift's **target** be set from it, and over what timeframe? The mockup shows 175 → 205 lb as an example only. Overhead press appears on Progress but isn't asked in onboarding: add it, or start tracking it from logged sets?
4. **Tab bar.** The mockup has Today / Plan / Progress / Profile. Where does the existing History page go: its own tab, or inside Progress?
5. **Plan reveal.** The current results page has a 12-week route, calories/macros and a disclaimer. The new design shows only the split and the week. Keep any of the rest below the fold?
6. **Tutorial videos.** No video files exist yet. Show the "How to do it" section with only muscles and cues until videos are added?

## Rules that apply everywhere

- One bold, data-forward element per screen.
- Rana appears on every main screen: interview bubbles in onboarding and plan reveal, a small corner tip elsewhere. Tips are short and specific: a weight, reps, or an exercise, never generic motivation.
- Keep accessibility: real buttons and links, `aria-label` on icon buttons, `role="progressbar"` with values, 44 px minimum hit areas, 4.5:1 text contrast (the tokens already pass), and visible focus.
- Respect `prefers-reduced-motion`. The only motion is the bubble entrance, bar fills, and the chevron.
- Keep using `Rana.ui.confirm` (never `window.confirm`) and `Rana.ui.numericField`.

Design source: the Rana app UI canvas on claude.ai (Brennan has the link).
