// The workout screen: logging a workout one exercise at a time.
//
// Opening it with ?date=YYYY-MM-DD starts (or resumes) today's suggested
// workout, ?session=ID resumes any workout by its id. Either way the workout
// exists as a session record from the moment it starts, so closing the tab
// loses nothing: Today shows "Resume".
//
// This file is the screen's flow (header, steps, footer, rest timer, finish).
// What a step contains is in js/core/workout-view.js; the rules (steps, finish
// checks, the rest timer) are in js/core/workout.js.

// Which workout is this page for? A workout already in progress wins: only
// one can be in progress at a time. Returns the session, null (nothing to
// log here) or undefined (we are redirecting to the one in progress).
function resolveSession({ data, plan, today }) {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("session");
  if (id) return Rana.storage.getSession(id);

  const date = params.get("date") || today;
  const inProgress = Rana.storage.getInProgressSession();
  if (inProgress) {
    if (inProgress.type === "planned" && inProgress.date === date) return inProgress;
    window.location.replace(`workout.html?session=${inProgress.session_id}`);
    return undefined;
  }
  // Start the suggested workout, but only for today and only if it isn't done yet.
  const finishedForDay = Rana.storage.getFinishedSessions().filter((s) => s.date === date);
  const scheduled = Rana.plan.getSessionForDate(date, plan, data, finishedForDay);
  if (scheduled.isRestDay || scheduled.status === "completed" || date !== today) return null;
  return Rana.storage.startSession({ type: "planned", title: scheduled.workout.day_name, workout_id: scheduled.workoutId, date });
}

Rana.page.start({
  requires: "active-plan",
  render(ctx) {
    const { el, button } = Rana.ui;
    const { data, profile } = ctx;
    const main = document.getElementById("main");

    let session = resolveSession(ctx);
    if (session === undefined) return;
    if (!session) return window.location.replace("today.html");
    if (session.finished_at) return window.location.replace(`workout-summary.html?session=${session.session_id}`);
    window.history.replaceState(null, "", `workout.html?session=${session.session_id}`); // a reload resumes it
    if (!session.exercises) session.exercises = []; // older records

    const update = (patch) => (session = Rana.storage.updateSession(session.session_id, patch));
    const sets = () => Rana.storage.getSetsForSession(session.session_id);

    let steps = Rana.workout.buildSteps({ session, data, profile });
    let index = Rana.workout.firstOpenStep(steps, sets());
    const panels = new Map(); // step id -> its panel, so typed numbers survive moving between steps

    // What a step's controls need from the screen.
    const env = {
      data, profile, history: { sets: ctx.sets, sessions: ctx.sessions },
      session: () => session,
      ensureExercise: (key) => { if (!session.exercises.includes(key)) update({ exercises: [...session.exercises, key] }); },
      removeExercise: (key) => { update({ exercises: session.exercises.filter((k) => k !== key) }); rebuildSteps(); },
      onSetDone: (seconds) => { update({ rest_started_at: new Date().toISOString(), rest_seconds: seconds }); tick(); },
      onChange: () => { panels.forEach((panel) => panel.refresh()); renderBar(); },
    };

    // ---- Header, steps bar, stage, footer -------------------------------------------
    const nameEl = el("span", "workout-header__name", Rana.plan.dayTitle(Rana.plan.sessionTitle(session, data)));
    const timeEl = el("span", "workout-header__time num");
    const header = el("header", "workout-header", [
      Rana.ui.iconButton({ icon: "close", label: "Exit workout", href: "today.html" }), // leaving is safe: it stays in progress
      el("div", "workout-header__center", [nameEl, timeEl]),
      button({ label: "Finish", kind: "action", onClick: finish }),
    ]);
    const barHost = el("div", "workout-bar");
    const stage = el("div", "workout-stage");
    const restHost = el("div", "rest-wrap");
    restHost.hidden = true;
    const primary = button({ label: "Next", kind: "primary" });
    const footer = Rana.ui.footerBar([restHost, primary]);
    footer.classList.add("footer-bar--workout");
    main.append(header, barHost, stage);
    document.body.append(footer);

    function renderBar() {
      const logged = sets();
      barHost.replaceChildren(Rana.ui.stepsBar({
        total: steps.length, current: index, label: "Exercise",
        filled: steps.map((step, i) => (Rana.workout.stepHasSets(step, logged) || i === index ? i : -1)).filter((i) => i >= 0),
        onSelect: (i) => go(i),
      }));
    }

    // The primary button always says where it leads.
    function renderFooter() {
      const step = steps[index];
      const next = steps[index + 1];
      let label;
      let onClick;
      if (step.type === "add") { label = "Add exercise"; onClick = openPicker; }
      else if (!next) { label = "Finish workout"; onClick = finish; }
      else { label = `Next: ${Rana.workout.stepName(next, data)}`; onClick = () => go(index + 1); }
      primary.textContent = label;
      primary.onclick = onClick;
    }

    function panelFor(step) {
      if (step.type === "add") {
        return {
          el: el("div", "step", [
            el("div", "step__heading", [el("h1", "t-xl", "Add exercise"), el("p", "t-sm muted", "Pick from the library. Add as many sets as you like.")]),
            steps.length === 1 ? Rana.ui.ranaTip(Rana.coach.LINES.freestyleEmpty, { workout: true }) : null,
          ]),
          hasLogged: () => false, refresh() {},
        };
      }
      if (!panels.has(step.id)) panels.set(step.id, Rana.workoutView.stepPanel(step, env));
      return panels.get(step.id);
    }

    // Shows a step, sliding in the direction of travel.
    function go(next, { instant = false } = {}) {
      const direction = next >= index ? "forward" : "back";
      const draw = () => {
        index = Math.max(0, Math.min(next, steps.length - 1));
        stage.replaceChildren(panelFor(steps[index]).el);
        renderBar();
        renderFooter();
        window.scrollTo(0, 0);
      };
      return instant ? draw() : Rana.ui.transition(draw, { direction });
    }

    // Exercises were added or removed: rebuild the step list, keeping typed numbers.
    function rebuildSteps(openKey) {
      steps = Rana.workout.buildSteps({ session, data, profile });
      [...panels.keys()].filter((id) => !steps.some((s) => s.id === id)).forEach((id) => panels.delete(id));
      const opened = openKey ? steps.findIndex((s) => s.key === openKey) : -1;
      go(opened >= 0 ? opened : Math.min(index, steps.length - 1));
    }

    function openPicker() {
      Rana.picker.open({
        data,
        addedKeys: new Set(session.exercises),
        onAdd: (keys) => {
          const fresh = keys.filter((k) => !session.exercises.includes(k));
          update({ exercises: [...session.exercises, ...fresh] });
          rebuildSteps(fresh[0]);
        },
      });
    }

    // ---- Time: the clock and the rest timer --------------------------------------------
    // Both are worked out from saved timestamps, so a reload changes nothing.
    let vibratedFor = null;
    function tick() {
      timeEl.textContent = Rana.workout.elapsedText(session.started_at);
      const rest = Rana.workout.restState(session);
      restHost.hidden = !rest;
      if (!rest) return;
      if (!restHost.firstChild) {
        restHost.append(Rana.ui.restRow({ remaining: rest.remaining, total: rest.total }), button({ label: "Skip", kind: "plain", ariaLabel: "Skip rest", onClick: () => { update({ rest_started_at: null, rest_seconds: null }); tick(); } }));
      }
      restHost.querySelector(".rest-row").update(rest.remaining, rest.total);
      if (rest.remaining === 0 && vibratedFor !== session.rest_started_at) {
        vibratedFor = session.rest_started_at;
        if (navigator.vibrate) navigator.vibrate(200); // no sound, no notification
      }
    }
    const firstRest = Rana.workout.restState(session);
    if (firstRest && firstRest.remaining === 0) vibratedFor = session.rest_started_at; // already over when the page opened
    setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);

    // ---- Finish ------------------------------------------------------------------------
    async function finish() {
      const check = Rana.workout.finishCheck({ session, sets: sets(), data });
      if (check.blocked) {
        const choice = await Rana.ui.sheet({
          title: "Nothing logged yet", message: check.message,
          actions: [{ label: "Keep logging", kind: "primary", value: "keep" }, { label: "Discard workout", kind: "secondary", value: "discard" }],
        }).result;
        if (choice === "discard" && await Rana.ui.confirm({ title: "Discard this workout?", message: "It will be deleted. This can't be undone.", confirmLabel: "Discard" })) {
          Rana.storage.discardSession(session.session_id);
          window.location.href = "today.html";
        }
        return;
      }
      if (check.confirm && !(await Rana.ui.confirm({ message: check.message, confirmLabel: "Finish anyway", cancelLabel: "Keep logging" }))) return;

      const words = { 1: "Easy", 3: "Solid", 5: "All-out" };
      let rating;
      const picker = el("div", "difficulty", [1, 2, 3, 4, 5].map((n) =>
        el("button", "difficulty__item", [el("span", "difficulty__number", String(n)), el("span", "difficulty__word", words[n] || "")], { type: "button", "aria-label": `${n}${words[n] ? `, ${words[n]}` : ""}` })));
      picker.addEventListener("click", (event) => {
        const item = event.target.closest(".difficulty__item");
        if (item) rating.close([...picker.children].indexOf(item) + 1);
      });
      rating = Rana.ui.sheet({ title: "How hard was that?", subtitle: "1 is easy, 5 is all-out. It helps me set your next weights.", content: picker, actions: [{ label: "Skip", kind: "text", value: 0 }] });
      const difficulty = await rating.result;
      if (difficulty === null) return; // dismissed: keep logging

      update({ rest_started_at: null, rest_seconds: null });
      Rana.storage.finishSession(session.session_id, difficulty || null);
      window.location.href = `workout-summary.html?session=${session.session_id}`;
    }

    go(index, { instant: true });
    tick();
  },
});
