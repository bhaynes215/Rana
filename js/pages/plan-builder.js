// Build-your-own-plan screen. The user's own plan is just a week: seven days,
// each Rest or Training, and every training day gets a short name ("Push",
// "Arms"...). No exercises are chosen here; on a training day the user builds
// the workout while logging, the way a freestyle workout works.
//
// ?from=results comes back to the plan reveal, anything else to the Plan tab.
// Editing an existing own plan opens with its days filled in.

const QUICK_NAMES = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Chest", "Back", "Shoulders", "Arms"];
const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

Rana.page.start({
  requires: "plan", // reachable from the plan reveal, before the plan is started
  render() {
    const { el, button } = Rana.ui;
    const returnTo = new URLSearchParams(window.location.search).get("from") === "results" ? "plan-reveal.html" : "plan.html";
    const existing = Rana.storage.getSavedPlans().own;

    // The week being edited: { Mon: { training: true, name: "Push" }, ... }
    const week = {};
    Rana.plan.WEEKDAY_ORDER.forEach((day) => {
      const training = existing ? existing.weekday_map[day] === Rana.plan.OWN_WORKOUT : false;
      week[day] = { training, name: training ? (existing.own_day_names || {})[day] || "" : "" };
    });

    const nameField = Rana.ui.field({ label: "Plan name", kind: "text", value: existing ? existing.name : "My plan" });
    nameField.input.maxLength = 40;
    const count = el("p", "t-sm muted");
    const error = el("p", "field__error", "", { role: "alert" });
    error.hidden = true;
    const snapshot = () => JSON.stringify({ name: nameField.getValue(), week });
    const opened = snapshot(); // to notice unsaved changes

    function updateCount() {
      const n = Rana.plan.WEEKDAY_ORDER.filter((d) => week[d].training).length;
      count.textContent = n === 0 ? "No training days yet" : `${n} ${n === 1 ? "day" : "days"} a week${n === 7 ? " · no rest days" : ""}`;
    }

    // One weekday card: Rest or Training, and for a training day a name with quick picks.
    function dayCard(day) {
      const input = Rana.ui.field({ label: `${DAY_NAMES[day]} workout name`, kind: "text", value: week[day].name, placeholder: "Name this day, e.g. Push" });
      input.input.maxLength = 24;
      const quick = Rana.ui.chipGroup({
        label: "Quick names", value: week[day].name,
        options: QUICK_NAMES.map((n) => ({ value: n, label: n })),
        onChange: (n) => { input.input.value = n; week[day].name = n; },
      });
      input.input.addEventListener("input", () => { week[day].name = input.input.value; quick.setValue(input.input.value.trim()); });
      const nameBox = el("div", "stack stack--tight", [input, quick]);
      const toggle = Rana.ui.chipGroup({
        label: `${DAY_NAMES[day]}: rest or training`, value: week[day].training ? "training" : "rest",
        options: [{ value: "rest", label: "Rest" }, { value: "training", label: "Training" }],
        onChange: (v) => { week[day].training = v === "training"; nameBox.hidden = !week[day].training; updateCount(); if (week[day].training) input.input.focus(); },
      });
      nameBox.hidden = !week[day].training;
      return el("li", "builder-day", [el("div", "builder-day__head", [el("span", "builder-day__name", DAY_NAMES[day]), el("div", "builder-day__toggle", toggle)]), nameBox]);
    }

    async function leave() {
      if (snapshot() !== opened && !(await Rana.ui.confirm({ title: "Leave without saving?", message: "Your changes to this plan are lost.", confirmLabel: "Leave" }))) return;
      window.location.href = returnTo;
    }

    function save() {
      error.hidden = true;
      const trainingDays = Rana.plan.WEEKDAY_ORDER.filter((d) => week[d].training);
      const fail = (message) => { error.textContent = message; error.hidden = false; };
      if (!trainingDays.length) return fail("Pick at least one training day.");
      const unnamed = trainingDays.filter((d) => !week[d].name.trim());
      if (unnamed.length) return fail(`Give ${unnamed.map((d) => DAY_NAMES[d]).join(", ")} a name, like Push or Legs.`);

      const weekdayMap = {};
      const ownDayNames = {};
      Rana.plan.WEEKDAY_ORDER.forEach((d) => {
        weekdayMap[d] = week[d].training ? Rana.plan.OWN_WORKOUT : null;
        if (week[d].training) ownDayNames[d] = week[d].name.trim();
      });
      Rana.plan.updateSavedPlan({
        plan_id: "own", kind: "own", name: nameField.getValue() || "My plan",
        weekday_map: weekdayMap, own_day_names: ownDayNames,
        created_at: existing ? existing.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      window.location.href = returnTo;
    }

    updateCount();
    document.getElementById("main").append(el("div", "builder", [
      el("div", "builder-head", [Rana.ui.iconButton({ icon: "back", label: "Back", onClick: leave }), el("h1", "t-xl", existing ? "Edit your plan" : "Build your own plan")]),
      el("p", "t-md muted", "Pick your training days and name each one. On the day, you build the workout from the exercise library."),
      nameField,
      count,
      el("ol", "builder-days", Rana.plan.WEEKDAY_ORDER.map(dayCard)),
      error,
    ]));
    document.body.append(Rana.ui.footerBar(button({ label: "Save plan", kind: "primary", onClick: save })));
  },
});
