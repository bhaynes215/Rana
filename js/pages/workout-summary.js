// The workout summary. What this workout earned comes from
// Rana.progress.workoutSummary (the XP ledger run with and without it).
//
// Right after finishing it plays a short, calm reveal: the XP lines land one
// at a time while the total counts up, then the level bar fills. Tap anywhere
// to skip; with reduced motion, or when opened from the history (the logbook,
// ?from=history), everything is simply there in its final state.
//
// "Edit" lets you fix a set, remove a set (with Undo) or delete the workout.
// XP and levels are always recalculated from the saved sets, so a correction
// flows through everything (a typo that inflated a level can lower it again).

const fromHistory = new URLSearchParams(window.location.search).get("from") === "history";
if (fromHistory) document.body.classList.add("has-tabbar"); // set before the first paint

Rana.page.start({
  requires: "active-plan",
  tab: fromHistory ? "progress" : undefined, // the quiet look back has the tab bar; the moment after a workout doesn't
  render(ctx) {
    const { el, button } = Rana.ui;
    const { data, profile, plan } = ctx;
    const main = document.getElementById("main");

    // ---- Which workout? ?session=ID, or (older links) the latest one that day ----
    const params = new URLSearchParams(window.location.search);
    let session = params.get("session") ? Rana.storage.getSession(params.get("session")) : null;
    if (!session && params.get("date")) {
      const onDate = ctx.sessions.filter((s) => s.date === params.get("date"));
      session = onDate[onDate.length - 1] || null;
    }
    if (!session) return window.location.replace("today.html");
    if (!session.finished_at) return window.location.replace(`workout.html?session=${session.session_id}`);

    const summary = Rana.progress.workoutSummary({ session, sessions: ctx.sessions, sets: ctx.sets, plan, data, profile });
    const sessionSets = ctx.sets.filter((s) => s.session_id === session.session_id).sort((a, b) => a.set_index - b.set_index);
    const minutes = Math.max(0, Math.round((new Date(session.finished_at) - new Date(session.started_at)) / 60000));
    const animate = !fromHistory && !Rana.ui.prefersReducedMotion();
    const nameOf = (key) => (data.exerciseByKey.get(key) || {}).exercise_name || key;
    const titleCase = (word) => word.charAt(0) + word.slice(1).toLowerCase();
    const title = Rana.plan.dayTitle(Rana.plan.sessionTitle(session, data));

    // ---- Header and Rana's line --------------------------------------------------------
    const header = el("header", "summary-header", [
      fromHistory ? Rana.ui.iconButton({ icon: "back", label: "Back", href: "history.html" }) : el("span", "summary-header__spacer"),
      el("h1", "summary-header__title", fromHistory ? title : "Workout done"),
      el("span", "summary-header__spacer"),
    ]);
    const say = Rana.coach.summaryLine({
      data, targetHits: summary.targetHits, levelBefore: summary.levelBefore, levelAfter: summary.levelAfter,
      increases: summary.increases, sets: sessionSets.length, minutes, restDay: summary.restDay,
    });
    const interview = Rana.ui.interview(say.text, { pose: say.pose });

    // ---- XP: the total, then the lines ----------------------------------------------------
    const totalEl = el("p", "t-display num", animate ? "+0 XP" : `+${summary.gained} XP`);
    const lineEls = summary.lines.map((line) =>
      el("li", `xp-line xp-line--${line.kind}${animate ? " is-pending" : ""}`, [
        el("span", "", [el("span", "xp-line__label", line.label), line.detail && el("span", "xp-line__detail", ` · ${line.detail}`)]),
        el("span", "xp-line__xp", `+${line.xp}`),
      ]));
    const noteEls = summary.notes.map((text) => el("p", `summary-note${animate ? " is-pending" : ""}`, text));
    const xpSection = el("section", "summary-xp", [
      el("div", "summary-xp__total", [el("p", "t-sm muted", "XP earned"), totalEl]),
      lineEls.length ? el("ul", "xp-lines", lineEls) : null,
      ...noteEls,
    ]);

    // ---- The level bar ---------------------------------------------------------------------
    const levelText = el("p", "t-lg", `Level ${animate ? summary.before.level : summary.after.level}`);
    const levelBar = Rana.ui.levelBar(animate ? summary.before : summary.after);
    const quiet = [];
    if (summary.tierAfter !== summary.tierBefore) quiet.push(`New milestone on your Profile: ${titleCase(summary.tierAfter)}`);
    summary.newTitles.forEach((t) => quiet.push(`New title on your Profile: ${t.name}`));
    const quietEls = quiet.map((text) => el("p", `summary-note${animate ? " is-pending" : ""}`, text));
    const levelSection = el("section", "summary-level", [levelText, levelBar, ...quietEls]);

    // ---- The recap and the editor ------------------------------------------------------------
    const byExercise = new Map();
    sessionSets.forEach((s) => byExercise.set(s.exercise_key, [...(byExercise.get(s.exercise_key) || []), s]));
    const increased = new Set(summary.increases.map((i) => i.exerciseKey));
    const kind = session.type === "freestyle" ? "Freestyle" : session.workout_id === Rana.plan.OWN_WORKOUT ? "Your plan" : "Suggested workout";
    const when = new Date(`${session.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const recapList = Rana.ui.listCard([...byExercise].map(([key, sets]) => ({
      title: nameOf(key),
      subtitle: sets.map((s) => Rana.progress.formatSet({ weight: Number(s.weight), reps: Number(s.reps) })).join(" · "),
      value: increased.has(key) ? "Best" : null,
    })));
    const editButton = button({ label: "Edit workout", kind: "secondary", compact: true, onClick: openEditor });
    const recap = el("section", "summary-recap", [
      el("div", "summary-recap__head", [
        el("h2", "t-lg", title),
        el("p", "t-sm muted", `${kind} · ${when}`),
        el("p", "t-sm muted num", `${minutes < 1 ? "Under a minute" : `${minutes} min`} · ${byExercise.size} ${byExercise.size === 1 ? "exercise" : "exercises"} · ${sessionSets.length} ${sessionSets.length === 1 ? "set" : "sets"}`),
      ]),
      recapList,
      editButton,
    ]);
    const editorHost = el("div");
    editorHost.hidden = true;

    main.append(el("div", "summary", [header, interview, xpSection, levelSection, recap, editorHost]));
    const footer = Rana.ui.footerBar(button({ label: fromHistory ? "Back to history" : "Done", kind: "primary", href: fromHistory ? "history.html" : "today.html" }));
    document.body.append(footer);

    // ---- The reveal -----------------------------------------------------------------------------
    // One step per XP line, then the level bar. Tapping runs what is left at once.
    let running = 0;
    let shown = 0;
    let timer = null;

    function setTotal(value, instant) {
      const from = shown;
      shown = value;
      if (instant) { totalEl.textContent = `+${value} XP`; return; }
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / 260);
        totalEl.textContent = `+${Math.round(from + (value - from) * t)} XP`;
        if (t < 1 && shown === value) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    function showLevel(instant) {
      const wait = instant ? 0 : 450;
      if (summary.levelAfter > summary.levelBefore && !instant) {
        // Fill the old level first, then start the new one.
        levelBar.update({ ...summary.before, xp: summary.before.nextLevelXp });
        setTimeout(() => { levelText.textContent = `Level ${summary.levelAfter}`; levelBar.update(summary.after); }, wait);
      } else {
        levelText.textContent = `Level ${summary.levelAfter}`;
        levelBar.update(summary.after);
      }
      [...noteEls, ...quietEls].forEach((n) => {
        n.classList.remove("is-pending");
        n.classList.add("is-in");
      });
    }

    const queue = lineEls.map((li, i) => (instant) => {
      li.classList.remove("is-pending");
      li.classList.add("is-in");
      running += summary.lines[i].xp;
      setTotal(running, instant);
    });
    queue.push((instant) => { setTotal(summary.gained, instant); showLevel(instant); });

    // Runs one queued step, then the next after a short beat.
    function next() {
      if (!queue.length) return;
      queue.shift()(false);
      timer = setTimeout(next, queue.length === 1 ? 500 : 340); // a little longer before the level bar
    }
    function skip() {
      clearTimeout(timer);
      while (queue.length) queue.shift()(true);
    }
    if (animate) {
      document.addEventListener("click", (event) => { if (!event.target.closest("a, button, input")) skip(); });
      timer = setTimeout(next, 350);
    }

    // ---- Editing a finished workout -------------------------------------------------------------
    function openEditor() {
      const rows = [];
      const blocks = [...byExercise].map(([key, sets]) => el("div", "", [
        el("p", "editor__name", nameOf(key)),
        el("div", "stack stack--tight", sets.map((set, i) => {
          const weight = Rana.ui.numericField(el("input", "set-input", null, { "aria-label": `${nameOf(key)} set ${i + 1} weight` }), { decimal: true });
          weight.value = Number(set.weight) > 0 ? String(set.weight) : "";
          const reps = Rana.ui.numericField(el("input", "set-input", null, { "aria-label": `${nameOf(key)} set ${i + 1} reps` }));
          reps.value = String(set.reps);
          // Remove toggles the row, so a mis-tap is easy to undo.
          const remove = button({ label: "Remove", kind: "secondary", compact: true });
          const row = el("div", "edit-row", [el("span", "edit-row__n", String(i + 1)), weight, el("span", "edit-row__times", "×"), reps, remove]);
          remove.addEventListener("click", () => {
            const removing = !row.classList.contains("is-removed");
            row.classList.toggle("is-removed", removing);
            remove.textContent = removing ? "Undo" : "Remove";
            weight.disabled = removing;
            reps.disabled = removing;
          });
          rows.push({ set, row, weight, reps });
          return row;
        })),
      ]));

      const error = el("p", "field__error", "", { role: "alert" });
      error.hidden = true;

      async function save() {
        const changes = [];
        for (const { set, row, weight, reps } of rows) {
          if (row.classList.contains("is-removed")) { changes.push({ set, remove: true }); continue; }
          const w = Number(weight.value || 0);
          const r = Number(reps.value);
          if (Number.isNaN(w) || w < 0 || !Number.isInteger(r) || r < 1) {
            error.textContent = "Each set needs a weight of 0 or more and at least 1 whole rep.";
            error.hidden = false;
            return;
          }
          if (Number(set.weight) !== w || Number(set.reps) !== r) changes.push({ set, weight: w, reps: r });
        }
        if (changes.filter((c) => c.remove).length === rows.length) {
          // Removing every set is the same as deleting the workout.
          if (!(await Rana.ui.confirm({ title: "Delete this workout?", message: "That removes every set, which deletes the workout and the XP it earned.", confirmLabel: "Delete workout" }))) return;
          return deleteWorkout();
        }
        changes.forEach((c) => (c.remove ? Rana.storage.deleteLoggedSet(c.set.set_id) : Rana.storage.updateLoggedSet(c.set.set_id, { weight: c.weight, reps: c.reps })));
        // Back to the logbook view: a correction never replays the reveal.
        window.location.href = `workout-summary.html?session=${session.session_id}&from=history`;
      }
      function deleteWorkout() {
        Rana.storage.discardSession(session.session_id);
        window.location.href = "history.html";
      }
      function closeEditor() {
        editorHost.hidden = true;
        recap.hidden = false;
        footer.hidden = false;
      }

      editorHost.replaceChildren(el("div", "editor", [
        el("h2", "t-lg", "Edit workout"),
        ...blocks,
        error,
        el("div", "editor__actions", [
          button({ label: "Save changes", kind: "primary", onClick: save }),
          button({ label: "Cancel", kind: "text", onClick: closeEditor }),
          button({
            label: "Delete workout", kind: "text",
            onClick: async () => {
              if (await Rana.ui.confirm({ title: "Delete this workout?", message: `"${title}" and the XP it earned are removed. This can't be undone.`, confirmLabel: "Delete" })) deleteWorkout();
            },
          }),
        ]),
      ]));
      recap.hidden = true;
      footer.hidden = true;
      editorHost.hidden = false;
      window.scrollTo(0, 0);
    }
  },
});
