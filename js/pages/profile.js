// Profile: who you are in the app, and every answer you gave Rana.
//   - your name, Level, and a quiet line of stats
//   - the six tier milestones and any earned titles
//   - your school email (sign out comes with real accounts)
//   - every questionnaire answer, each with Edit (the same controls the
//     questionnaire uses, from js/core/questions.js)
//   - your starting lifts, the "recent set" answers behind your lift targets
//
// Most edits just save. Two change Rana's suggested plan: the goal and the
// training days (they pick the split). For those a confirm says what will
// change first; the user's own plan is never touched, and past XP never changes
// (see Rana.plan.previewPlanChange). Editing a starting lift changes its
// target the next time everything is recalculated from your saved sets.

Rana.page.start({
  requires: "active-plan",
  tab: "profile",
  render(ctx) {
    const { el, button } = Rana.ui;
    const { data } = ctx;
    let profile = ctx.profile;
    const ledger = ctx.ledger();
    const questions = Rana.questions;
    const main = document.getElementById("main");
    const titleCase = (word) => word.charAt(0) + word.slice(1).toLowerCase();

    function saveAndReload(next) {
      Rana.storage.saveProfile(next);
      window.location.reload();
    }

    // ---- You ------------------------------------------------------------------------------
    const level = Rana.game.levelForXp(ledger.totalXp);
    const sessionsWord = ledger.sessionsCompleted === 1 ? "session" : "sessions";
    const who = el("section", "card card--hero profile-who", [
      el("p", "t-lg strong", profile.name),
      el("h2", "t-2xl", `Level ${level}`),
      el("p", "t-sm muted num", `${Rana.ui.format.number(ledger.totalXp)} XP · ${ledger.sessionsCompleted} ${sessionsWord} · longest streak ${ledger.longestStreak}`),
    ]);

    // ---- Milestones and titles --------------------------------------------------------------
    const currentTier = Rana.game.tierForLevel(level);
    const nextTier = Rana.game.TIERS.find((t) => t.minLevel > level);
    const milestones = el("section", "profile-section", [
      el("h2", "profile-heading", "Milestones"),
      el("div", "milestones", Rana.game.TIERS.map((t) => el("span", t.name === currentTier ? "milestone is-current" : level >= t.minLevel ? "milestone is-reached" : "milestone", titleCase(t.name), t.name === currentTier ? { "aria-current": "true" } : {}))),
      el("p", "t-sm muted", nextTier ? `Next: ${titleCase(nextTier.name)} at Level ${nextTier.minLevel}` : "You've reached the top milestone."),
    ]);
    const titles = Rana.game.earnedTitles(ledger);
    const titleList = el("section", "profile-section", [
      el("h2", "profile-heading", "Titles"),
      titles.length
        ? el("ul", "titles", titles.map((t) => el("li", "", [el("strong", "", t.name), ` · ${t.description}`])))
        : el("p", "t-sm muted", "No titles yet. Your first comes with a 10-session streak."),
    ]);

    // ---- Account -----------------------------------------------------------------------------
    const account = el("section", "profile-section", [
      el("h2", "profile-heading", "Account"),
      Rana.ui.listCard([{ title: "School email", subtitle: profile.email || "Not saved (you signed up before emails were kept)" }]),
      button({ label: "Sign out", kind: "secondary", compact: true, disabled: true }),
      el("p", "t-sm muted", "Signing out comes with real accounts."),
    ]);

    // ---- Your answers ---------------------------------------------------------------------------
    // The days question is edited together with the weekdays (the count is how many are ticked).
    const editable = questions.list.filter((q) => q.type !== "days" && q.type !== "lifts");
    const labelFor = (q) => (q.id === "weekdays" ? "Training days" : q.label);

    function displayValue(q) {
      const v = profile[q.field];
      if (q.type === "single") return ((q.options.find((o) => o.value === v) || {}).label) || "—";
      if (q.type === "multi") return v && v.length ? v.map((x) => (q.options.find((o) => o.value === x) || {}).label || x).join(", ") : "Nothing";
      if (q.type === "weekdays") {
        const days = Rana.plan.WEEKDAY_ORDER.filter((d) => (v || []).includes(d));
        return `${days.length} days · ${days.join(", ")}`;
      }
      if (q.type === "height") return v ? questions.formatHeight(v) : "—";
      if (v === null || v === undefined || v === "") return q.optional ? "Not set" : "—";
      return q.unit ? `${v} ${q.unit}` : String(v);
    }

    function editAnswer(q) {
      // "None of these" is how the questionnaire shows no limitations.
      const answers = { ...profile, limitations: profile.limitations && profile.limitations.length ? profile.limitations : ["none"] };
      const control = Rana.answerControl(q, answers);

      async function save(close) {
        let value = control.read();
        const error = q.id === "weekdays"
          ? (value.length >= 3 && value.length <= 6 ? null : "Pick 3 to 6 days. (For a different number, build your own plan on the Plan tab.)")
          : q.validate ? q.validate(value, answers) : null;
        if (error) return control.showError(error);

        if (q.type === "number") value = value === "" ? null : Number(value);
        if (q.type === "text") value = value.trim();
        if (q.id === "limitations") value = value.filter((x) => x !== "none");
        const next = { ...profile, [q.field]: value };
        if (q.id === "weekdays") next.training_days_per_week = value.length;

        // The goal and the training days pick Rana's split: say what changes, then change it.
        if (q.id === "goal" || q.id === "weekdays") {
          const change = Rana.plan.previewPlanChange(next, data);
          if (change.error) return control.showError(change.error);
          if (!change.unchanged) {
            if (!(await Rana.ui.confirm({ title: "Update Rana's plan?", message: change.message, confirmLabel: "Update plan" }))) return;
            Rana.plan.applyPlanChange(change);
          }
        }
        close(true);
        saveAndReload(next);
      }

      Rana.ui.sheet({
        title: `Edit ${labelFor(q).toLowerCase()}`,
        content: control.el,
        actions: [{ label: "Save", kind: "primary", onClick: save }, { label: "Cancel", kind: "secondary", value: null }],
      });
      if (control.focus) control.focus.focus({ preventScroll: true });
    }

    const row = (title, value, onEdit, label) =>
      el("li", "", el("div", "list-row answer-row", [
        el("span", "list-row__text", [el("span", "list-row__title", title), el("span", "list-row__sub", value)]),
        button({ label: "Edit", kind: "action", ariaLabel: `Edit ${label || title}`, onClick: onEdit }),
      ]));

    const answersSection = el("section", "profile-section", [
      el("h2", "profile-heading", "Your answers"),
      el("ul", "card card--list", editable.map((q) => row(labelFor(q), displayValue(q), () => editAnswer(q), labelFor(q)))),
    ]);

    // ---- Starting lifts -----------------------------------------------------------------------------
    const ranaPlan = Rana.storage.getSavedPlans().rana || ctx.plan;
    const lifts = Rana.plan.liftsToAskAbout(Rana.plan.mainLifts(ranaPlan, data, profile));

    function answerText(lift) {
      const a = profile.starting_lifts[lift.exercise_key];
      if (!a) return "Not answered";
      if (a.skipped) return "Skipped";
      return lift.unit === "reps" ? `${a.reps} reps` : `${a.weight} lb × ${a.reps}`;
    }

    function editLift(lift) {
      const exercise = data.exerciseByKey.get(lift.exercise_key);
      const reps = lift.unit === "reps";
      const current = profile.starting_lifts[lift.exercise_key];
      const filled = current && !current.skipped ? current : null;
      const weight = reps ? null : Rana.ui.field({ label: "Weight", unit: "lb", value: filled ? String(filled.weight) : "" });
      const repsField = Rana.ui.field({ label: "Reps", value: filled ? String(filled.reps) : "" });
      const fields = el("div", "stack stack--tight", [
        el("p", "t-sm muted", reps ? "How many can you do in one good set?" : "A recent set you did with good form."),
        el("div", reps ? "" : "q-fields", [weight, repsField]),
      ]);
      const store = (value, close) => {
        close(true);
        saveAndReload({ ...profile, starting_lifts: { ...profile.starting_lifts, [lift.exercise_key]: value } });
      };
      Rana.ui.sheet({
        title: exercise.exercise_name,
        content: fields,
        actions: [
          {
            label: "Save", kind: "primary",
            onClick: (close) => {
              const r = Number(repsField.getValue());
              const w = reps ? 0 : Number(weight.getValue());
              if (weight && !(w >= 1 && w <= 1000)) weight.setError("Enter a weight between 1 and 1,000 lb.");
              if (!(r >= 1 && r <= 30)) repsField.setError("Enter reps between 1 and 30.");
              if ((weight && !(w >= 1 && w <= 1000)) || !(r >= 1 && r <= 30)) return;
              store({ weight: w, reps: r }, close);
            },
          },
          { label: "I haven't done this", kind: "secondary", onClick: (close) => store({ skipped: true }, close) },
          { label: "Cancel", kind: "text", value: null },
        ],
      });
    }

    const liftsSection = !lifts.length ? null : el("section", "profile-section", [
      el("h2", "profile-heading", "Starting lifts"),
      el("p", "t-sm muted", "The recent sets behind your lift targets on Progress."),
      el("ul", "card card--list", lifts.map((lift) => {
        const name = (data.exerciseByKey.get(lift.exercise_key) || {}).exercise_name || lift.exercise_key;
        return row(name, answerText(lift), () => editLift(lift), `${name} starting lift`);
      })),
    ]);

    main.append(el("div", "profile", [el("h1", "t-xl", "Profile"), who, milestones, titleList, account, answersSection, liftsSection]));
  },
});
