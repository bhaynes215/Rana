// Today: the screen you open every day. From the top:
//   - the date, your Level (the one big number), the level bar, your streak
//   - the week, as seven small markers
//   - Rana's tip for today
//   - today's workout, in whichever state it is in:
//       a workout in progress, a rest day, a day of your own plan, the suggested
//       workout, or "done for today"
//
// The plan is a suggestion, not a rule: on a rest day there is still a way to
// train ("Start a workout anyway"), and on a training day a way to do
// something else. Following the plan is rewarded through the streak boost in
// XP, never enforced. Browsing never starts a workout: only the Start buttons do.

Rana.page.start({
  requires: "active-plan",
  tab: "today",
  render(ctx) {
    const { el, button } = Rana.ui;
    const { data, profile, plan, today } = ctx;
    const main = document.getElementById("main");

    const finishedToday = ctx.sessions.filter((s) => s.date === today);
    const scheduled = Rana.plan.getSessionForDate(today, plan, data, finishedToday);
    const inProgress = Rana.storage.getInProgressSession();
    const ledger = ctx.ledger();

    const longDate = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const shortDate = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    // ---- Level, bar and streak ----------------------------------------------
    const xp = ledger.totalXp;
    const level = Rana.game.levelForXp(xp);
    const streak = Rana.coach.streakLine({ streak: ledger.currentStreak, restDay: scheduled.isRestDay });
    const head = el("header", "today-head", [
      el("div", "today-head__top", [el("p", "t-md muted", longDate(today)), el("h1", "t-display", `Level ${level}`)]),
      Rana.ui.levelBar({ xp, level, levelStartXp: Rana.game.xpForLevel(level), nextLevelXp: Rana.game.xpForLevel(level + 1) }),
      el("p", "today-streak", [Rana.icons.svg("flame", { size: 22 }), el("span", "", [streak.lead && el("strong", "", streak.lead), streak.text])]),
    ]);

    // ---- The week -----------------------------------------------------------
    // Seven markers, Monday first. A day with a finished workout opens its summary.
    const sessionsOn = (dateStr) => ctx.sessions.filter((s) => s.date === dateStr);
    const monday = Rana.progress.mondayOf(today);
    const weekDays = Rana.plan.WEEKDAY_ORDER.map((short, i) => {
      const date = Rana.progress.addDays(monday, i);
      const done = sessionsOn(date);
      const day = Rana.plan.getSessionForDate(date, plan, data, done);
      const state = day.isRestDay ? "rest" : day.status === "completed" ? "done" : day.status === "off-plan" ? "offplan" : day.status === "missed" ? "missed" : "training";
      const last = done[done.length - 1];
      return {
        short, name: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }), state,
        today: date === today,
        href: last ? `workout-summary.html?session=${last.session_id}&from=history` : null,
      };
    });
    const week = Rana.ui.weekRow({ days: weekDays });

    // ---- Rana's tip -----------------------------------------------------------
    const tip = Rana.ui.ranaTip(Rana.coach.todayTip(ctx).text);

    // ---- Freestyle: name it, then go straight to logging -------------------------
    function startFreestyle() {
      const name = Rana.ui.field({ label: "Name your workout", kind: "text", value: `Freestyle · ${shortDate(today)}` });
      const sheet = Rana.ui.sheet({
        title: "Freestyle workout",
        content: name,
        actions: [
          { label: "Start workout", kind: "primary", onClick: (close) => close(name.getValue() || `Freestyle · ${shortDate(today)}`) },
          { label: "Cancel", kind: "secondary", value: null },
        ],
      });
      name.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          sheet.close(name.getValue() || `Freestyle · ${shortDate(today)}`);
        }
      });
      sheet.result.then((title) => {
        if (!title) return;
        // If a workout was started in another tab meanwhile, resume it instead:
        // only one can be in progress.
        const session = Rana.storage.getInProgressSession() || Rana.storage.startSession({ type: "freestyle", title, date: today });
        window.location.href = `workout.html?session=${session.session_id}`;
      });
    }
    const freestyleButton = (label) => button({ label, kind: "text", onClick: startFreestyle });

    // ---- Today's workout: one card, whichever state it is in -------------------
    const eyebrow = (text) => el("p", "card__eyebrow", text);
    const title = (text) => el("h2", "t-xl card__title", text);
    const meta = (icon, text) => el("span", "", [Rana.icons.svg(icon, { size: 18 }), text]);
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

    function card() {
      // A workout that was started and not finished: the way back in.
      if (inProgress) {
        const earlier = inProgress.date < today;
        const minutes = Math.max(0, Math.round((Date.now() - new Date(inProgress.started_at)) / 60000));
        const sets = Rana.storage.getSetsForSession(inProgress.session_id).length;
        const started = earlier ? `Started ${shortDate(inProgress.date)}` : minutes < 1 ? "Just started" : `Started ${minutes} min ago`;
        return el("section", "card card--hero", [
          eyebrow(earlier ? "You didn't finish this workout" : "Workout in progress"),
          title(Rana.plan.dayTitle(Rana.plan.sessionTitle(inProgress, data))),
          el("div", "meta-row", [meta("clock", `${started} · ${plural(sets, "set")} logged`)]),
          el("div", "btn-stack today-actions", [
            button({ label: "Resume", kind: "primary", href: `workout.html?session=${inProgress.session_id}` }),
            button({
              label: "Discard", kind: "text",
              onClick: async () => {
                const sure = await Rana.ui.confirm({
                  title: "Discard this workout?",
                  message: `"${Rana.plan.sessionTitle(inProgress, data)}" and its sets are deleted and earn no XP. This can't be undone.`,
                  confirmLabel: "Discard",
                });
                if (sure) {
                  Rana.storage.discardSession(inProgress.session_id);
                  window.location.reload();
                }
              },
            }),
          ]),
        ]);
      }

      // Already trained today: a quiet summary instead of a Start button.
      const doneSession = scheduled.status === "completed" ? finishedToday.find((s) => s.type === "planned") : null;
      const lastToday = finishedToday[finishedToday.length - 1];
      if (doneSession || (scheduled.isRestDay && lastToday)) {
        const session = doneSession || lastToday;
        return el("section", "card card--hero", [
          eyebrow("Today's workout"),
          title("Done for today"),
          el("div", "meta-row num", [meta("dumbbell", Rana.plan.dayTitle(Rana.plan.sessionTitle(session, data))), el("span", "", `+${Rana.ui.format.number(Rana.game.xpForSession(ledger, session))} XP`)]),
          el("div", "btn-stack today-actions", [
            button({ label: "See summary", kind: "secondary", href: `workout-summary.html?session=${session.session_id}` }),
            freestyleButton("Start another workout"),
          ]),
        ]);
      }

      if (scheduled.isRestDay) {
        return el("section", "card card--hero", [
          eyebrow("Today"),
          title("Rest day"),
          el("p", "today-note", "Rest is part of the plan."),
          el("div", "btn-stack today-actions", [button({ label: "Start a workout anyway", kind: "secondary", onClick: startFreestyle })]),
        ]);
      }

      // A day of the user's own plan: nothing to preview, they add exercises while logging.
      if (scheduled.isOwnWorkout) {
        return el("section", "card card--hero", [
          eyebrow("Today's workout"),
          title(scheduled.workout.day_name),
          el("p", "today-note", "Your plan · add exercises as you go."),
          el("div", "btn-stack today-actions", [
            button({ label: "Start workout", kind: "primary", href: `workout.html?date=${today}` }),
            freestyleButton("Do something else"),
          ]),
        ]);
      }

      // The suggested workout: its exercises, around any limitation the user reported.
      const picks = Rana.plan.suggestWorkout(scheduled.slots, data, Rana.plan.activeLimitations(profile));
      const rows = scheduled.slots.map((slot, i) => {
        const exercise = picks[i].exerciseKey ? data.exerciseByKey.get(picks[i].exerciseKey) : null;
        const caution = picks[i].caution && picks[i].caution.length ? `Go light: loads your ${picks[i].caution.map((j) => j.replace("-", " ")).join(" and ")}.` : null;
        return el("li", "", [
          el("span", "", exercise ? exercise.exercise_name : slot.movement_pattern),
          el("span", "exercise-list__value", `${slot.working_sets} × ${Rana.ui.format.range(slot.rep_range)}`),
          caution && el("span", "exercise-list__caution", caution),
        ]);
      });
      rows.push(el("li", "exercise-list__abs", [el("span", "", "Abs (optional)"), el("span", "exercise-list__value", Rana.plan.ABS_HINT)]));
      return el("section", "card card--hero", [
        eyebrow("Today's workout"),
        title(Rana.plan.dayTitle(scheduled.workout.day_name)),
        el("div", "meta-row num", [meta("dumbbell", plural(scheduled.slots.length, "exercise")), meta("clock", `About ${scheduled.workout.est_session_minutes} min`)]),
        el("ol", "exercise-list", rows),
        el("div", "btn-stack today-actions", [
          button({ label: "Start workout", kind: "primary", href: `workout.html?date=${today}` }),
          freestyleButton("Do something else"),
        ]),
      ]);
    }

    main.append(el("div", "today", [head, week, tip, card()]));
  },
});
