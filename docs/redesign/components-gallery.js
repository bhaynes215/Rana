// Builds the component gallery page. Temporary (see components.html).
Rana.page.start({
  requires: "none",
  tab: "today",
  render() {
    const { el, button, iconButton } = Rana.ui;
    const main = document.getElementById("main");
    const section = (title, ...children) => main.append(el("section", "g-section", [el("h2", "", title), ...children]));

    main.append(el("h1", "t-xl", "Components"));

    // Type
    section("Type",
      el("p", "t-display", "Level 7"),
      el("p", "t-2xl", "Upper / Lower"),
      el("p", "t-xl", "Incline press"),
      el("p", "t-lg", "How many days a week can you train?"),
      el("p", "t-md", "Heavy upper body compounds"),
      el("p", "t-sm muted", "Add 5 lb today. You hit every rep last time."),
      el("p", "t-xs muted", "Recommended"));

    // Rana
    section("Rana",
      el("div", "g-poses", ["wave", "think", "cheer", "neutral"].map((pose) => Rana.ui.rana(pose, 76))),
      el("div", "g-poses", [Rana.ui.rana("avatar", 44), Rana.ui.rana("avatar", 36)]));

    // Bubbles
    section("Speech bubbles",
      Rana.ui.interview("Okay Brennan, the big one. What are you training for right now?", { pose: "wave" }),
      Rana.ui.interview("You're set, Brennan. This is the plan I'd pick for getting stronger on 4 days, and it starts on Monday.", { pose: "cheer", width: 124 }),
      Rana.ui.ranaTip("Add 5 lb to your incline bench today. You hit all 8 reps on every set last time."),
      Rana.ui.ranaTip("Add 5 lb today. You hit every rep last time.", { workout: true }));

    // Progress
    const level = Rana.ui.levelBar({ xp: 1840, level: 7, levelStartXp: 1584, nextLevelXp: 2156 });
    const lift = Rana.ui.liftBar({ name: "Squat", start: 225, current: 245, target: 275 });
    const rest = Rana.ui.restRow({ remaining: 102, total: 150 });
    const steps = Rana.ui.stepsBar({ total: 6, current: 1, filled: [0, 1], onSelect: () => {} });
    const topbar = Rana.ui.topbar({ onBack: () => {}, current: 14, total: 15 });
    let bumped = false;
    section("Progress bars",
      level, lift, rest, steps, topbar,
      button({
        label: "Animate the values", kind: "secondary", compact: true,
        onClick: () => {
          bumped = !bumped;
          level.update(bumped ? { xp: 2000, level: 7, levelStartXp: 1584, nextLevelXp: 2156 } : { xp: 1840, level: 7, levelStartXp: 1584, nextLevelXp: 2156 });
          lift.update(bumped ? { start: 225, current: 265, target: 275 } : { start: 225, current: 245, target: 275 });
          rest.update(bumped ? 20 : 102, 150);
          steps.update(bumped ? { current: 4, filled: [0, 1, 2, 3] } : { current: 1, filled: [0, 1] });
          topbar.update(bumped ? 3 : 14, 15);
        },
      }));

    // Buttons
    section("Buttons",
      button({ label: "Start workout", kind: "primary" }),
      button({ label: "Disabled", kind: "primary", disabled: true }),
      button({ label: "Start a workout anyway", kind: "secondary" }),
      el("div", "row row--between", [
        button({ label: "I don't bench yet", kind: "text" }),
        button({ label: "Finish", kind: "action" }),
        button({ label: "Add set", kind: "plain", icon: "add" }),
        iconButton({ icon: "back", label: "Back" }),
        iconButton({ icon: "close", label: "Exit workout" }),
      ]));

    // Cards
    const hero = el("div", "card card--hero", [
      el("p", "card__eyebrow", "Today's workout"),
      el("h2", "t-xl card__title", "Upper A"),
      el("div", "meta-row num", [
        el("span", "", [Rana.icons.svg("dumbbell", { size: 18 }), "6 exercises"]),
        el("span", "", [Rana.icons.svg("clock", { size: 18 }), "About 60 min"]),
      ]),
      el("ol", "exercise-list", [
        ["Barbell incline bench", "3 × 6–8"], ["Pull-up", "3 × 5–7"], ["Dumbbell lateral raise", "3 × 12–15"],
      ].map(([name, value]) => el("li", "", [el("span", "", name), el("span", "exercise-list__value", value)]))),
      el("div", "", button({ label: "Start workout", kind: "primary" }), { style: "margin-top:16px" }),
    ]);
    section("Cards", hero,
      Rana.ui.listCard([
        { title: "Upper A", subtitle: "Heavy upper body compounds", value: "60 min" },
        { title: "Lower A", subtitle: "Heavy squat and hinge", value: "45 min" },
      ]));

    // Option groups
    section("Option cards (single choice)",
      Rana.ui.optionGroup({
        label: "Main goal", value: "get-stronger", options: [
          { value: "build-muscle", label: "Build muscle", description: "Add size and definition" },
          { value: "lose-fat", label: "Lose fat", description: "Lean out and keep your strength" },
          { value: "get-stronger", label: "Get stronger", description: "Move more weight on the big lifts" },
          { value: "general-fitness", label: "General fitness", description: "Feel good and stay consistent" },
        ],
      }));
    section("Number tiles",
      Rana.ui.optionGroup({
        label: "Training days per week", variant: "tile", value: "4", options: [3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n), unit: "days", tag: n <= 4 ? "Recommended" : "" })),
      }));
    section("Option cards (several answers)",
      Rana.ui.optionGroup({
        label: "Limitations", multiple: true, value: ["knee"], options: [
          { value: "knee", label: "Knee" }, { value: "shoulder", label: "Shoulder" }, { value: "lower-back", label: "Lower back" },
        ],
      }));

    // Collapsible
    section("Collapsible",
      Rana.ui.collapsible({ title: "How to do it", subtitle: "Video and muscles worked", body: "" }),
      Rana.ui.collapsible({
        title: "How to do it", subtitle: "Video and muscles worked", open: true,
        body: [
          Rana.ui.videoSlot({ caption: "Video coming soon" }),
          el("div", "", [el("p", "section-label", "Muscles worked"), Rana.ui.muscleChips({ primary: "Upper chest", secondary: ["Front delts", "Triceps"] })], { style: "display:flex;flex-direction:column;gap:8px" }),
          el("p", "t-sm", "Set the bench to 30 degrees. Any steeper and the work shifts from your chest to your front delts."),
          el("p", "t-sm muted", "Tempo 3-1-1-0: three seconds down, one second pause, then press."),
        ],
      }));

    // Inputs
    const errField = Rana.ui.field({ label: "Reps", value: "80" });
    errField.setError("Enter reps between 1 and 30.");
    section("Fields",
      el("div", "g-row", [
        Rana.ui.field({ label: "Weight", unit: "lb", value: "150" }),
        Rana.ui.field({ label: "Reps", value: "5" }),
      ]),
      errField,
      Rana.ui.field({ label: "What should I call you?", kind: "text", placeholder: "Your name" }));
    section("Chips",
      Rana.ui.chipGroup({
        label: "Exercise", value: "a", options: [
          { value: "a", label: "Barbell incline bench" }, { value: "b", label: "Incline dumbbell press" }, { value: "c", label: "Incline Smith press" },
        ],
      }),
      Rana.ui.stepChips({ steps: ["Bench press", "Squat", "Deadlift"], current: 0 }));

    // Set table
    const table = Rana.ui.setTable({ label: "Sets" });
    const makeToggle = (next, row) => row.setDone(next);
    table.addRow(Rana.ui.setRow({ index: 1, last: "135 × 8", weight: "140", reps: "8", done: true, onToggle: makeToggle }));
    table.addRow(Rana.ui.setRow({ index: 2, last: "135 × 8", weight: "140", reps: "8", done: true, onToggle: makeToggle }));
    table.addRow(Rana.ui.setRow({ index: 3, last: "135 × 8", weight: "140", onToggle: makeToggle }));
    section("Set table",
      Rana.ui.prescription({ working_sets: 3, rep_range: "6-8", target_rpe: 8, rest_seconds: 150 }),
      table,
      button({ label: "Add set", kind: "plain", icon: "add" }));

    // The week
    section("Week strip",
      Rana.ui.weekStrip({
        days: [
          { short: "Mon", lines: ["Upper", "A"] }, { short: "Tue", lines: ["Lower", "A"] }, { short: "Wed", lines: null },
          { short: "Thu", lines: ["Upper", "B"] }, { short: "Fri", lines: ["Lower", "B"] }, { short: "Sat", lines: null }, { short: "Sun", lines: null },
        ],
      }));
    section("Week row",
      Rana.ui.weekRow({
        days: [
          { short: "Mon", name: "Monday", state: "done" }, { short: "Tue", name: "Tuesday", state: "missed" },
          { short: "Wed", name: "Wednesday", state: "rest" }, { short: "Thu", name: "Thursday", state: "offplan" },
          { short: "Fri", name: "Friday", state: "training", today: true }, { short: "Sat", name: "Saturday", state: "rest" },
          { short: "Sun", name: "Sunday", state: "rest" },
        ],
      }));

    // Empty state
    section("Empty state", Rana.ui.emptyState({ pose: "wave", text: "No workouts yet. Your first one shows up here.", actionLabel: "Start workout" }));

    // Overlays
    let footer = null;
    section("Sheets and footer",
      el("div", "btn-stack", [
        button({ label: "Open a confirm sheet", kind: "secondary", compact: true, onClick: () => Rana.ui.confirm({ message: "Discard this workout? Your sets will be deleted.", confirmLabel: "Discard" }) }),
        button({ label: "Open a form sheet", kind: "secondary", compact: true, onClick: () => {
          const input = Rana.ui.field({ label: "Name your workout", kind: "text", value: "Freestyle · Sat, Nov 28" });
          const s = Rana.ui.sheet({ title: "Freestyle workout", content: input, actions: [
            { label: "Start", kind: "primary", onClick: (close) => (input.getValue() ? close(input.getValue()) : input.setError("Give it a name.")) },
            { label: "Cancel", kind: "secondary", value: null },
          ] });
          s.result.then((v) => console.log("sheet result:", v));
        } }),
        button({ label: "Toggle the pinned footer", kind: "secondary", compact: true, onClick: () => {
          if (footer) { footer.remove(); footer = null; document.body.classList.remove("has-footer"); return; }
          footer = Rana.ui.footerBar(button({ label: "Next: pull-up", kind: "primary" }));
          document.body.append(footer);
          document.body.classList.add("has-footer");
        } }),
      ]));
  },
});
