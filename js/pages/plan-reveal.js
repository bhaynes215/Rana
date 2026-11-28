// The plan reveal: the screen right after the questionnaire. Rana shows the
// plan he'd pick (the split, the week, each session), then below the fold
// the 12-week route and the daily targets. "Start my plan" locks it in
// (sets the start date) and moves on to sign-up.
//
// If the user built their own plan, a choice above the button says which of
// the two to start; nothing is locked in until the button is pressed.

// What each phase of the 12-week route means.
const PHASE_INFO = {
  calibration: { name: "Calibration", text: "Find your working weights. Every session earns XP; strength XP unlocks once an exercise has 3 sessions logged." },
  build: { name: "Build", text: "Beat your best on each lift. Every new best earns XP, and bigger jumps earn more." },
  deload: { name: "Deload", text: "A lighter week built into your split so your body can recover. It still counts: show up and keep your streak." },
};

// [cal, cal, cal, build, build, deload] -> Weeks 1-3 Calibration, Weeks 4-5 Build, Week 6 Deload.
function phaseRanges(weeks) {
  const ranges = [];
  weeks.forEach((w) => {
    const last = ranges[ranges.length - 1];
    if (last && last.phase === w.phase) last.end = w.week;
    else ranges.push({ phase: w.phase, start: w.week, end: w.week });
  });
  return ranges;
}

// "Week 6", "Weeks 1–3", or for a phase that comes back: "Weeks 4–5, 7–11".
function weekLabel(ranges) {
  const parts = ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`));
  const single = ranges.length === 1 && ranges[0].start === ranges[0].end;
  return `${single ? "Week" : "Weeks"} ${parts.join(", ")}`;
}

const daysText = (n) => `${n} ${n === 1 ? "day" : "days"} a week`;

Rana.page.start({
  requires: "plan", // a draft plan is exactly what this screen is for
  render({ data, profile, plan: draftPlan }) {
    const { el, button } = Rana.ui;
    const main = document.getElementById("main");

    const saved = Rana.storage.getSavedPlans();
    const ranaDef = saved.rana || { split_id: draftPlan.split_id, weekday_map: draftPlan.weekday_map };
    const split = data.splitById.get(ranaDef.split_id);
    const ranaDays = Rana.plan.trainingDayCount(ranaDef.weekday_map);

    // Each block fades in a beat after the one before it (see .reveal-in).
    let order = 0;
    const reveal = (node) => {
      node.classList.add("reveal-in");
      node.style.setProperty("--i", order++);
      return node;
    };

    // ---- Rana's plan ------------------------------------------------------
    const interview = Rana.ui.interview(Rana.coach.planRevealLine({ name: profile.name, goal: profile.goal, days: ranaDays }), { pose: "cheer", width: 124 });
    const title = reveal(el("div", "reveal-title", [
      el("h1", "t-2xl", Rana.plan.shortSplitName(split)),
      el("p", "t-md muted", `${daysText(ranaDays)}, about ${split.est_session_minutes} minutes each`),
    ]));
    const week = reveal(Rana.ui.weekStrip({ days: Rana.plan.weekDays(ranaDef.weekday_map, data).map((d) => ({ short: d.weekday, lines: d.lines })) }));

    const seen = new Set();
    const sessions = Rana.plan.weekDays(ranaDef.weekday_map, data)
      .map((d) => d.workout)
      .filter((w) => w && !seen.has(w.workout_id) && seen.add(w.workout_id));
    const sessionList = reveal(Rana.ui.listCard(sessions.map((w) => ({
      title: Rana.plan.dayTitle(w.day_name),
      subtitle: w.session_focus,
      value: `${w.est_session_minutes} min`,
    }))));

    // ---- Which plan to start (only once the user has built their own) --------
    const own = saved.own;
    const planChoice = reveal(el("div", "stack stack--tight"));
    if (own) {
      const ownDays = Rana.plan.trainingDayCount(own.weekday_map);
      planChoice.append(
        Rana.ui.optionGroup({
          label: "Which plan to start",
          value: draftPlan.active_plan_id || "rana",
          options: [
            { value: "rana", label: "Rana's plan", description: `${Rana.plan.shortSplitName(split)} · ${daysText(ranaDays)}` },
            { value: "own", label: own.name || "My plan", description: `${daysText(ownDays)} · You build each workout` },
          ],
          onChange: (id) => {
            Rana.plan.activatePlan(id); // still a draft, so this just swaps the week
            renderRoute();
          },
        }),
        button({ label: "Edit my plan", kind: "text", href: "plan-builder.html?from=results" })
      );
    } else {
      planChoice.append(button({ label: "Build your own plan", kind: "text", href: "plan-builder.html?from=results" }));
    }

    // ---- Below the fold: the 12-week route ------------------------------------
    // It follows whichever plan will start. A plan's sessions per week are the
    // weekdays that actually have a workout; an own plan has no deload weeks.
    const routeHost = reveal(el("section", "reveal-section"));
    function renderRoute() {
      const plan = Rana.storage.getPlan();
      const ownActive = (plan.active_plan_id || "rana") === "own";
      const perWeek = Rana.plan.trainingDayCount(plan.weekday_map) || split.days_per_week;
      const route = Rana.game.forecastRoute(perWeek, ownActive ? null : split.deload_every_weeks);
      const ranges = phaseRanges(route.weeks);

      const track = el("div", "route-track", route.weeks.map((w) =>
        el("span", `route-track__week--${w.phase}`, null, { title: `Week ${w.week}: ${PHASE_INFO[w.phase].name}` })), { "aria-hidden": "true" });
      const legend = Rana.ui.listCard(["calibration", "build", "deload"]
        .filter((phase) => ranges.some((r) => r.phase === phase))
        .map((phase) => ({ title: PHASE_INFO[phase].name, subtitle: PHASE_INFO[phase].text, value: weekLabel(ranges.filter((r) => r.phase === phase)) })));

      routeHost.replaceChildren(
        el("h2", "reveal-heading", Rana.coach.LINES.routeHeading),
        el("p", "t-lg", Rana.coach.fill(Rana.coach.LINES.routeFloor, { level: route.finalLevel })),
        track,
        legend
      );
    }
    renderRoute();

    // ---- Below the fold: daily targets and the disclaimer ----------------------
    const t = Rana.game.computeCalorieTargets(profile);
    const targets = reveal(el("section", "reveal-section", [
      el("h2", "reveal-heading", Rana.coach.LINES.targetsHeading),
      Rana.ui.listCard([
        { title: "Calories", value: `${t.calories.toLocaleString()} kcal` },
        { title: "Protein", value: `${t.proteinG} g` },
        { title: "Carbs", value: `${t.carbsG} g` },
        { title: "Fat", value: `${t.fatG} g` },
        { title: "Water", value: `${t.waterCups} cups` },
      ]),
      el("p", "reveal-note", "Projections assume full adherence to the plan and aren't medical advice. Check with a doctor before starting a new training or nutrition program, especially with any existing condition."),
    ]));

    main.append(el("div", "reveal", [interview, title, week, sessionList, planChoice, routeHost, targets]));

    // ---- Start my plan ---------------------------------------------------------
    // Locking in sets the plan's start date to today. A plan that was already
    // started keeps its date (opening this screen again must never restart it).
    document.body.append(Rana.ui.footerBar(button({
      label: "Start my plan",
      kind: "primary",
      onClick: () => {
        const plan = Rana.storage.getPlan();
        if (plan.status !== "active") {
          plan.start_date = Rana.plan.todayStr();
          plan.status = "active";
          Rana.storage.savePlan(plan);
        }
        window.location.href = "sign-up.html";
      },
    })));
  },
});
