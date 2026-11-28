// The Plan tab: the ACTIVE plan in full (its week, and its days opening to show
// their exercises), then the other plan as a smaller card with "Set active".
// There are two plans: Rana's suggested one and, optionally, one the user
// built (days only: they add the exercises while logging).
//
// Switching is safe for past XP: Rana.plan.activatePlan keeps the old week in
// plan.schedule_history, so days before the switch are still judged against
// the plan that was active then (see plan.js, scheduleFor).

Rana.page.start({
  requires: "active-plan",
  tab: "plan",
  render(ctx) {
    const { el, button } = Rana.ui;
    const { data, profile } = ctx;
    const saved = Rana.storage.getSavedPlans();
    const activeId = ctx.plan.active_plan_id || "rana";
    const ranaDef = saved.rana || { split_id: ctx.plan.split_id, weekday_map: ctx.plan.weekday_map };
    const split = data.splitById.get(ranaDef.split_id);
    const daysText = (n) => `${n} ${n === 1 ? "day" : "days"} a week`;
    const weekdayName = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

    // ---- A suggested day's exercises (the picks around any limitation) ----------------
    function dayDetail(workout) {
      const slots = data.slotsByWorkout.get(workout.workout_id) || [];
      const picks = Rana.plan.suggestWorkout(slots, data, Rana.plan.activeLimitations(profile));
      const rows = slots.map((slot, i) => {
        const exercise = picks[i].exerciseKey ? data.exerciseByKey.get(picks[i].exerciseKey) : null;
        return el("li", "", [el("span", "", exercise ? exercise.exercise_name : slot.movement_pattern), el("span", "exercise-list__value", `${slot.working_sets} × ${Rana.ui.format.range(slot.rep_range)}`)]);
      });
      rows.push(el("li", "exercise-list__abs", [el("span", "", "Abs (optional)"), el("span", "exercise-list__value", Rana.plan.ABS_HINT)]));
      return el("ol", "exercise-list", rows);
    }

    // ---- A plan in full: its name, week and days ------------------------------------------
    function planInFull(id) {
      if (id === "rana") {
        const days = Rana.plan.weekDays(ranaDef.weekday_map, data);
        const seen = new Set();
        const workouts = days.map((d) => d.workout).filter((w) => w && !seen.has(w.workout_id) && seen.add(w.workout_id));
        return [
          el("h2", "t-xl", Rana.plan.shortSplitName(split)),
          el("p", "t-md muted plan-active__sub", `${daysText(Rana.plan.trainingDayCount(ranaDef.weekday_map))}, about ${split.est_session_minutes} minutes each`),
          Rana.ui.weekStrip({ days: days.map((d) => ({ short: d.weekday, lines: d.lines })) }),
          Rana.ui.expandableList(workouts.map((w) => ({ title: Rana.plan.dayTitle(w.day_name), subtitle: w.session_focus, value: `${w.est_session_minutes} min`, detail: () => dayDetail(w) }))),
        ];
      }
      const own = saved.own;
      const days = Rana.plan.weekDays(own.weekday_map, data, own.own_day_names || {});
      return [
        el("h2", "t-xl", own.name || "My plan"),
        el("p", "t-md muted plan-active__sub", `${daysText(Rana.plan.trainingDayCount(own.weekday_map))} · You build each workout`),
        Rana.ui.weekStrip({ days: days.map((d) => ({ short: d.weekday, lines: d.lines })) }),
        Rana.ui.listCard(days.filter((d) => d.ownName).map((d) => ({ title: d.ownName, subtitle: "You add the exercises as you go", value: weekdayName[d.weekday] }))),
      ];
    }

    // ---- Switching and deleting ---------------------------------------------------------------
    async function setActive(id) {
      const name = id === "rana" ? "Rana's plan" : "your plan";
      const when = Rana.plan.switchEffectiveDate() === Rana.plan.todayStr() ? "from today" : "from tomorrow (you've already trained today)";
      const sure = await Rana.ui.confirm({
        title: `Switch to ${name}?`,
        message: `Today follows it ${when}. Your workouts and XP stay.`,
        confirmLabel: "Set active",
      });
      if (!sure) return;
      const result = Rana.plan.activatePlan(id);
      const tomorrow = result && result.effectiveFrom && result.effectiveFrom !== Rana.plan.todayStr();
      window.location.href = `plan.html${tomorrow ? "?switched=tomorrow" : ""}`;
    }

    async function deleteOwn() {
      const sure = await Rana.ui.confirm({ title: "Delete your plan?", message: "Workouts you already logged with it stay in your history.", confirmLabel: "Delete" });
      if (!sure) return;
      Rana.storage.deleteSavedPlan("own");
      window.location.reload();
    }

    // ---- The other plan: a smaller card ----------------------------------------------------------
    function otherPlan() {
      if (activeId === "own") {
        return el("section", "card card--hero plan-other", [
          el("h3", "t-lg", "Rana's plan"),
          el("p", "t-sm muted", `${Rana.plan.shortSplitName(split)} · ${daysText(Rana.plan.trainingDayCount(ranaDef.weekday_map))}`),
          button({ label: "Set active", kind: "secondary", onClick: () => setActive("rana") }),
        ]);
      }
      if (saved.own) {
        return el("section", "card card--hero plan-other", [
          el("h3", "t-lg", saved.own.name || "My plan"),
          el("p", "t-sm muted", `${daysText(Rana.plan.trainingDayCount(saved.own.weekday_map))} · You build each workout`),
          el("div", "plan-actions", [
            button({ label: "Set active", kind: "secondary", onClick: () => setActive("own") }),
            button({ label: "Edit", kind: "action", href: "plan-builder.html" }),
            button({ label: "Delete", kind: "text", onClick: deleteOwn }),
          ]),
        ]);
      }
      return el("section", "card card--hero plan-other", [
        el("h3", "t-lg", "Build your own plan"),
        el("p", "t-sm muted", "Pick your training days and name each one. On the day, you build the workout from the exercise library."),
        button({ label: "Build your own plan", kind: "secondary", href: "plan-builder.html" }),
      ]);
    }

    const switchedTomorrow = new URLSearchParams(window.location.search).get("switched") === "tomorrow";
    document.getElementById("main").append(el("div", "planpage", [
      el("h1", "t-xl", "Plan"),
      switchedTomorrow ? Rana.ui.ranaTip("You already trained today, so the new plan starts tomorrow.") : null,
      el("section", "plan-active", [
        el("span", "plan-tag", "Active"),
        ...planInFull(activeId),
        activeId === "own" ? el("div", "plan-actions", button({ label: "Edit plan", kind: "action", href: "plan-builder.html" })) : null,
      ]),
      otherPlan(),
    ]));
  },
});
