// The full workout history: every finished workout (suggested, your own plan
// and freestyle), newest first, grouped by month. Reached from Progress.
//
// Nothing new is stored for this screen: it is another view of the session
// records. The XP shown per workout comes from the same XP ledger as
// everywhere else, split per workout with Rana.game.xpForSession, so the
// rows always add up to your total.

Rana.page.start({
  requires: "active-plan",
  tab: "progress", // History lives inside Progress
  render(ctx) {
    const { el } = Rana.ui;
    const { data, today } = ctx;
    const ledger = ctx.ledger();

    const setCounts = new Map();
    ctx.sets.forEach((s) => setCounts.set(s.session_id, (setCounts.get(s.session_id) || 0) + 1));

    // Newest first: by date, then by start time within a day.
    const ordered = [...ctx.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.started_at.localeCompare(a.started_at));

    const thisMonth = today.slice(0, 7); // "2026-11"
    const monthCount = ordered.filter((s) => s.date.startsWith(thisMonth)).length;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

    const head = el("div", "history-head", [
      Rana.ui.iconButton({ icon: "back", label: "Back to Progress", href: "progress.html" }),
      el("h1", "t-xl", "All workouts"),
    ]);
    const parts = [head];

    if (!ordered.length) {
      parts.push(Rana.ui.emptyState({ pose: "wave", text: Rana.coach.LINES.noHistory, actionLabel: "Go to Today", href: "today.html" }));
    } else {
      parts.push(el("p", "t-sm muted", `${plural(ordered.length, "workout")} · ${monthCount} this month · ${plural(ctx.sets.length, "set")} logged`));

      const months = new Map(); // "2026-11" -> sessions, newest first
      ordered.forEach((s) => months.set(s.date.slice(0, 7), [...(months.get(s.date.slice(0, 7)) || []), s]));
      months.forEach((sessions, month) => {
        parts.push(el("section", "history-month", [
          el("div", "section-head", [
            el("h2", "t-sm strong muted", new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })),
            el("span", "t-sm muted num", plural(sessions.length, "workout")),
          ]),
          Rana.ui.listCard(sessions.map((session) => {
            const minutes = Math.max(0, Math.round((new Date(session.finished_at) - new Date(session.started_at)) / 60000));
            const kind = session.type === "freestyle" ? "Freestyle" : session.workout_id === Rana.plan.OWN_WORKOUT ? "Your plan" : null;
            const day = new Date(`${session.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            return {
              title: Rana.plan.dayTitle(Rana.plan.sessionTitle(session, data)),
              subtitle: [day, kind, minutes > 0 ? `${minutes} min` : null, plural(setCounts.get(session.session_id) || 0, "set")].filter(Boolean).join(" · "),
              value: `+${Rana.ui.format.number(Rana.game.xpForSession(ledger, session))} XP`,
              href: `workout-summary.html?session=${session.session_id}&from=history`,
            };
          })),
        ]));
      });
    }
    document.getElementById("main").append(el("div", "progress", parts));
  },
});
