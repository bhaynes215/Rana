// One step of a workout, drawn: the title, the prescription, the exercise
// chips, "How to do it", Rana's tip and the set table. The workout screen
// (js/pages/workout.js) builds one panel per step and shows one at a time; a
// panel keeps its own typed-but-not-logged numbers while you look at another step.
//
//   const panel = Rana.workoutView.stepPanel(step, env)
//   panel.el            the DOM to show
//   panel.hasLogged()   does this step have any logged set?
//   panel.refresh()     re-check which buttons apply (after a set changes)
//
// `env` is what the screen provides:
//   data, profile        the library and the questionnaire answers
//   session()            the workout record (it is replaced when updated, so ask each time)
//   history              { sets, sessions }: FINISHED sets and sessions (for "last time" and tips)
//   ensureExercise(key)  remember an exercise a freestyle/abs step logged
//   removeExercise(key)  drop an exercise nothing was logged for
//   onSetDone(seconds)   a set was marked done: start the rest timer
//   onChange()           any set was logged or removed: refresh the bar and buttons

window.Rana = window.Rana || {};

Rana.workoutView = (() => {
  const trim = (n) => String(Number(Number(n).toFixed(1)));

  function stepPanel(step, env) {
    const { el, button } = Rana.ui;
    const { data } = env;
    const exerciseOf = (key) => data.exerciseByKey.get(key);
    const slot = step.type === "slot" ? step.slot : null;
    const keys = Rana.workout.stepKeys(step);
    const sessionId = () => env.session().session_id;
    const storedSets = () => Rana.workout.stepSets(step, Rana.storage.getSetsForSession(sessionId()));

    // Open on the exercise last logged in this step, else the suggested one.
    const already = storedSets();
    let currentKey = already.length ? already[already.length - 1].exercise_key : keys[0];

    // ---- Heading ---------------------------------------------------------------
    const first = exerciseOf(currentKey);
    const title = step.type === "slot" ? slot.movement_pattern : step.type === "abs" ? "Abs" : first ? first.exercise_name : currentKey;
    const subtitle =
      step.type === "slot" ? Rana.ui.prescription(slot)
        : step.type === "abs" ? el("p", "t-sm muted", `Optional · ${Rana.plan.ABS_HINT}`)
          : el("p", "t-sm muted", first ? `${first.muscle_group} · ${first.equipment}` : "");
    const heading = el("div", "step__heading", [el("h1", "t-xl", title), subtitle]);

    // ---- Exercise chips and the caution note (slots and abs) ----------------------
    const chips = keys.length > 1
      ? Rana.ui.chipGroup({
          label: "Exercise",
          value: currentKey,
          options: keys.map((k) => ({ value: k, label: exerciseOf(k) ? exerciseOf(k).exercise_name : k })),
          onChange: (key) => select(key),
        })
      : null;
    const caution = el("p", "t-sm muted");

    // Only an exercise nothing was logged for can be removed (logged sets are real).
    const removeButton = step.type === "exercise"
      ? button({ label: "Remove exercise", kind: "text", onClick: () => env.removeExercise(step.key) })
      : null;

    // ---- The parts that depend on the selected exercise ----------------------------
    const body = el("div", "step__body");
    const parts = new Map(); // exercise_key -> the built parts (kept, so typed numbers survive switching)

    function buildParts(key) {
      const exercise = exerciseOf(key);
      const bodyweight = Boolean(exercise && exercise.equipment === "Bodyweight");
      const suggestion = Rana.coach.suggestion(key, slot, { data, sets: env.history.sets, sessions: env.history.sessions, excludeSessionId: sessionId() });
      const last = Rana.progress.lastTime(key, env.history, sessionId());
      const topReps = slot ? String(slot.rep_range).split("-").pop() : "";
      const base = suggestion.weight === null || suggestion.weight === undefined ? "" : trim(suggestion.weight);

      // How to do it: a video slot (none exist yet), muscles, the cue and the tempo.
      const cue = (slot && slot.coaching_cue) || (exercise && exercise.coaching_cue);
      const tempo = slot ? Rana.workout.tempoText(slot.tempo) : null;
      const secondary = String((exercise && exercise.target_muscle_secondary) || "").split(";").map((m) => m.trim()).filter(Boolean);
      const howTo = Rana.ui.collapsible({
        title: "How to do it",
        subtitle: "Video and muscles worked",
        body: [
          Rana.ui.videoSlot({ caption: "Video coming soon" }),
          el("div", "step__muscles", [el("p", "section-label", "Muscles worked"), Rana.ui.muscleChips({ primary: exercise && exercise.target_muscle_primary, secondary })]),
          cue && el("p", "t-sm", cue),
          tempo && el("p", "t-sm muted", tempo),
        ],
      });
      const effort = Rana.coach.effortNote(key, { data, profile: env.profile });
      const tip = Rana.ui.ranaTip(suggestion.text, { workout: true, extra: effort && effort.text });

      // ---- The set table ------------------------------------------------------------
      const table = Rana.ui.setTable({ label: `${exercise ? exercise.exercise_name : key} sets` });
      const errorLine = el("p", "field__error", "", { role: "alert" });
      errorLine.hidden = true;

      const stored = storedSets().filter((s) => s.exercise_key === key).sort((a, b) => a.set_index - b.set_index);
      const prescribed = slot ? slot.working_sets : Rana.workout.BUILT_ROWS;
      const rowCount = Math.max(prescribed, ...stored.map((s) => s.set_index));
      const byIndex = new Map();
      stored.forEach((s) => { if (!byIndex.has(s.set_index)) byIndex.set(s.set_index, s); });

      const fail = (row, which, message) => {
        errorLine.textContent = message;
        errorLine.hidden = false;
        row.setError(which);
        (which === "weight" ? row.weightInput : row.repsInput).focus();
      };

      function toggle(next, row) {
        if (!next) {
          Rana.storage.deleteLoggedSet(row.dataset.setId); // un-marking removes the set
          delete row.dataset.setId;
          row.setDone(false);
          env.onChange();
          return;
        }
        const { weight, reps } = row.values();
        const repsNumber = Number(reps);
        const weightNumber = weight === "" ? (bodyweight ? 0 : NaN) : Number(weight);
        if (!(repsNumber >= 1 && repsNumber <= 30)) return fail(row, "reps", "Enter reps between 1 and 30.");
        if (Number.isNaN(weightNumber) || weightNumber > 1000 || (!bodyweight && weightNumber <= 0)) return fail(row, "weight", "Enter a weight between 1 and 1,000 lb.");

        const set = Rana.storage.addLoggedSet({
          slot_id: slot ? slot.slot_id : null,
          exercise_key: key,
          rep_range: slot ? slot.rep_range : null,
          session_id: sessionId(),
          date: env.session().date,
          set_index: table.rows.indexOf(row) + 1,
          weight: weightNumber,
          reps: repsNumber,
          completed_at: new Date().toISOString(),
        });
        row.dataset.setId = set.set_id;
        row.setError(null);
        errorLine.hidden = true;
        row.setDone(true);
        if (step.type !== "slot") env.ensureExercise(key);
        // The sets still to do start from the weight just used (unless typed over).
        table.rows.slice(table.rows.indexOf(row) + 1).forEach((later) => {
          if (!later.dataset.setId && !later.dataset.dirty && weightNumber > 0) later.weightInput.value = trim(weightNumber);
        });
        env.onSetDone(Rana.workout.restSecondsFor(slot));
        env.onChange();
      }

      function makeRow(index, existing, carry) {
        const row = Rana.ui.setRow({
          index,
          last: last[index - 1] ? Rana.progress.formatSet(last[index - 1]) : null,
          weight: existing ? (existing.weight > 0 ? trim(existing.weight) : "") : carry,
          reps: existing ? String(existing.reps) : "",
          done: Boolean(existing),
          bodyweight,
          repsPlaceholder: topReps,
          onToggle: toggle,
        });
        if (existing) row.dataset.setId = existing.set_id;
        row.weightInput.addEventListener("input", () => { row.dataset.dirty = "1"; errorLine.hidden = true; row.setError(null); });
        row.repsInput.addEventListener("input", () => { errorLine.hidden = true; row.setError(null); });
        return row;
      }

      // Rows already logged show their numbers; the rest start from the suggested weight.
      let carry = base;
      for (let i = 1; i <= rowCount; i++) {
        const existing = byIndex.get(i) || null;
        if (existing && existing.weight > 0) carry = trim(existing.weight);
        table.addRow(makeRow(i, existing, carry));
      }
      stored.filter((s) => byIndex.get(s.set_index) !== s).forEach((extra) => table.addRow(makeRow(table.rows.length + 1, extra, carry)));

      const addSet = button({
        label: "Add set", kind: "plain", icon: "add",
        onClick: () => {
          const lastRow = table.rows[table.rows.length - 1];
          const weight = lastRow ? lastRow.weightInput.value : base;
          const row = table.addRow(makeRow(table.rows.length + 1, null, weight));
          row.repsInput.focus();
        },
      });

      return { nodes: [howTo, tip, el("div", "step__sets", [table, errorLine, addSet])] };
    }

    function select(key) {
      currentKey = key;
      if (!parts.has(key)) parts.set(key, buildParts(key));
      body.replaceChildren(...parts.get(key).nodes);
      if (chips) chips.setValue(key);
      // The note applies while the suggested exercise is selected; swapping is the user's choice.
      const showNote = slot && key === step.pick.exerciseKey && (step.pick.caution.length || step.pick.substituted);
      caution.hidden = !showNote;
      if (showNote) caution.textContent = step.pick.caution.length ? Rana.plan.cautionText(step.pick.caution) : Rana.plan.swapText(step.pick, data);
    }

    const root = el("div", "step", [heading, chips, caution, removeButton, body]);
    const api = {
      el: root,
      hasLogged: () => Rana.workout.stepHasSets(step, Rana.storage.getSetsForSession(sessionId())),
      refresh: () => { if (removeButton) removeButton.hidden = storedSets().length > 0; },
    };
    select(currentKey);
    api.refresh();
    return api;
  }

  return { stepPanel };
})();
