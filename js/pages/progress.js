// Progress: Rana's tip, your main lifts against their targets, XP by week,
// and your most recent workouts (with a link to the full history).
//
// The main lifts are the first exercise of each day of Rana's plan, even if
// your own plan is the active one: an own plan has no exercises to track.
// Each lift's numbers come from the XP ledger (everything is recalculated
// from your saved sets, nothing is stored).

Rana.page.start({
  requires: "active-plan",
  tab: "progress",
  render(ctx) {
    const { el, button } = Rana.ui;
    const { data, profile, plan, today } = ctx;
    const ledger = ctx.ledger();

    // ---- Strength --------------------------------------------------------------------
    const ranaPlan = Rana.storage.getSavedPlans().rana || plan;
    const rows = Rana.progress.liftRows({ lifts: Rana.plan.mainLifts(ranaPlan, data, profile), ledger, data });

    function liftRow(row) {
      const reps = row.unit === "reps";
      const value = row.current === null ? "—" : String(row.current);
      const top = el("div", "strength__top", [
        el("span", "strength__name", row.name),
        el("span", "strength__value num", [value, reps && row.current !== null ? el("span", "strength__unit", "reps") : null]),
      ]);
      if (row.state === "tracking") {
        return el("li", "strength__row", [top, Rana.ui.liftBar({ name: row.name, unit: row.unit, start: row.start, current: row.current, target: row.target })]);
      }
      const note = row.state === "calibrating"
        ? `Finding your starting weight · ${row.sessions} of ${row.calibrationOf} sessions`
        : "Not logged yet";
      return el("li", "strength__row", [top, el("p", "strength__note", note)]);
    }

    const strength = el("section", "card card--hero strength", [
      el("div", "strength__head", [el("h2", "t-lg", "Strength"), el("span", "t-sm muted", "Estimated max, lb")]),
      el("ul", "strength__list", rows.map(liftRow)),
    ], { "aria-label": "Strength" });

    // ---- Level history: XP each week -------------------------------------------------------
    const weeks = Rana.progress.weeklyXp(ledger, today, 5);
    const maxXp = Math.max(1, ...weeks.map((w) => w.xp));
    const shortDate = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const chart = el("div", "chart", weeks.map((week, i) => {
      const bar = el("div", "chart__bar");
      bar.style.height = `${Math.max(6, Math.round((week.xp / maxXp) * 68))}px`; // the tallest week is 68px
      return el("div", i === weeks.length - 1 ? "chart__week is-current" : "chart__week", [
        week.levelReached ? el("span", "chart__level", `Level ${week.levelReached}`) : null,
        bar,
        el("span", "chart__date", shortDate(week.weekStart)),
      ], { role: "img", "aria-label": `Week of ${shortDate(week.weekStart)}: ${Rana.ui.format.number(week.xp)} XP${week.levelReached ? `, reached Level ${week.levelReached}` : ""}` });
    }));
    const levelHistory = el("section", "section-block", [
      el("div", "section-head", [el("h2", "t-lg", "Level history"), el("span", "t-sm muted", "XP each week")]),
      chart,
    ], { "aria-label": "Level history" });

    // ---- Recent workouts -----------------------------------------------------------------------
    const recent = Rana.progress.recentSessions({ sessions: ctx.sessions, sets: ctx.sets, ledger }, 3);
    const when = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const recentSection = el("section", "section-block", [
      el("div", "section-head", [el("h2", "t-lg", "Recent workouts"), button({ label: "See all", kind: "action", href: "history.html" })]),
      recent.length
        ? Rana.ui.listCard(recent.map(({ session, xp, setCount }) => ({
            title: Rana.plan.dayTitle(Rana.plan.sessionTitle(session, data)),
            subtitle: `${when(session.date)} · ${setCount} ${setCount === 1 ? "set" : "sets"}`,
            value: `+${Rana.ui.format.number(xp)} XP`,
            href: `workout-summary.html?session=${session.session_id}&from=history`,
          })))
        : el("p", "t-sm muted", Rana.coach.LINES.noHistory),
    ]);

    document.getElementById("main").append(el("div", "progress", [
      el("h1", "t-xl", "Progress"),
      Rana.ui.ranaTip(Rana.coach.progressTip({ rows, today }).text),
      strength,
      levelHistory,
      recentSection,
    ]));
  },
});
