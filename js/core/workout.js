// The logic of a workout in progress: which steps it has, whether a step has
// sets, whether it is ready to finish, the rest timer and how long it has
// run. Plain functions on a session record, the library and the logged sets,
// so they can be tested without a page (the screen itself is
// js/pages/workout.js, and one step's controls are in workout-view.js).
//
// A workout is a list of STEPS, one screen each:
//   the suggested workout   one step per slot, then an optional "abs" step
//   freestyle / own plan    one step per exercise the user added, then an
//                           "add" step that opens the exercise picker
// Every step the user logs is stored as ordinary logged sets; the steps
// themselves are never stored, they are rebuilt from the session each time
// (that is what makes resuming a workout exact).

window.Rana = window.Rana || {};

Rana.workout = (() => {
  const DEFAULT_REST_SECONDS = 120; // when an exercise has no prescribed rest (freestyle, abs)
  const BUILT_ROWS = 3; // empty set rows a freestyle or abs exercise starts with

  // Freestyle workouts and days of the user's own plan are built exercise by
  // exercise (no library workout behind them).
  const isBuilt = (session) => session.type === "freestyle" || session.workout_id === Rana.plan.OWN_WORKOUT;

  // ---------------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------------
  // [{ id, type: "slot" | "abs" | "exercise" | "add", slot?, pick?, options?, key? }]
  // For a slot, `options` lists its exercises with the suggested one (the
  // main exercise, unless it loads a joint the user reported) first.
  function buildSteps({ session, data, profile }) {
    if (isBuilt(session)) {
      return [...(session.exercises || []).map((key) => ({ id: `ex:${key}`, type: "exercise", key })), { id: "add", type: "add" }];
    }
    const slots = data.slotsByWorkout.get(session.workout_id) || [];
    const picks = Rana.plan.suggestWorkout(slots, data, Rana.plan.activeLimitations(profile));
    const steps = slots.map((slot, i) => {
      const ranked = (data.optionsBySlot.get(slot.slot_id) || []).map((o) => o.exercise_key);
      const options = [...new Set([picks[i].exerciseKey, ...ranked].filter(Boolean))];
      return { id: `slot:${slot.slot_id}`, type: "slot", slot, pick: picks[i], options };
    });
    const abs = Rana.plan.absOptions(data, slots);
    if (abs.length) steps.push({ id: "abs", type: "abs", options: abs.map((e) => e.exercise_key) });
    return steps;
  }

  // The exercise keys a step can log.
  const stepKeys = (step) => (step.type === "exercise" ? [step.key] : step.options || []);

  // The logged sets that belong to a step (a slot's sets by slot, the rest by exercise).
  function stepSets(step, sets) {
    if (step.type === "slot") return sets.filter((s) => s.slot_id === step.slot.slot_id);
    if (step.type === "add") return [];
    return sets.filter((s) => s.slot_id == null && stepKeys(step).includes(s.exercise_key));
  }

  const stepHasSets = (step, sets) => stepSets(step, sets).length > 0;

  // Where to open a workout: the first slot that still has sets to log (or the
  // abs step once every slot is done); for a built workout, the last exercise.
  function firstOpenStep(steps, sets) {
    if (steps.some((s) => s.type === "slot")) {
      const open = steps.findIndex((s) => s.type === "slot" && stepSets(s, sets).length < s.slot.working_sets);
      if (open >= 0) return open;
      const abs = steps.findIndex((s) => s.type === "abs");
      return abs >= 0 ? abs : steps.length - 1;
    }
    return Math.max(0, steps.length - 2); // the last exercise, or the "add" step when there are none
  }

  // The name Rana's "Next:" button uses for a step.
  function stepName(step, data) {
    if (step.type === "slot") {
      const suggested = data.exerciseByKey.get(step.options[0]);
      return suggested ? suggested.exercise_name : step.slot.movement_pattern;
    }
    if (step.type === "abs") return "abs";
    if (step.type === "add") return "add exercise";
    const exercise = data.exerciseByKey.get(step.key);
    return exercise ? exercise.exercise_name : step.key;
  }

  // ---------------------------------------------------------------------
  // Finishing
  // ---------------------------------------------------------------------
  const prescribedSets = (slots) => slots.reduce((sum, s) => sum + s.working_sets, 0);

  // Sets that count toward finishing the suggested workout: per slot, up to
  // the prescribed number (extra sets never push a workout over the line).
  const creditedSets = (slots, sets) =>
    slots.reduce((sum, slot) => sum + Math.min(sets.filter((s) => s.slot_id === slot.slot_id).length, slot.working_sets), 0);

  // Is this workout ready to finish? Returns
  //   { blocked: true,  message }   nothing logged: finish isn't possible
  //   { confirm: true,  message }   it won't earn session XP: ask first
  //   { }                           fine
  function finishCheck({ session, sets, data }) {
    if (sets.length === 0) return { blocked: true, message: "Nothing is logged yet. Log a set, or discard this workout." };
    if (isBuilt(session)) {
      const min = Rana.game.XP_RULES.FREESTYLE_MIN_SETS;
      if (sets.length < min) return { confirm: true, message: `Log at least ${min} sets to earn session XP. Finish anyway?` };
      return {};
    }
    const slots = data.slotsByWorkout.get(session.workout_id) || [];
    if (creditedSets(slots, sets) / prescribedSets(slots) < Rana.game.XP_RULES.COMPLETION_THRESHOLD) {
      return { confirm: true, message: "That's under half of the suggested workout, so it won't count as following the plan. Finish anyway?" };
    }
    return {};
  }

  // ---------------------------------------------------------------------
  // Time: the rest timer and how long the workout has run
  // ---------------------------------------------------------------------
  const restSecondsFor = (slot) => (slot && slot.rest_seconds ? slot.rest_seconds : DEFAULT_REST_SECONDS);

  // The rest timer, worked out from the timestamp saved on the session (so it
  // survives closing the tab): { remaining, total } in whole seconds, or null.
  function restState(session, nowMs = Date.now()) {
    if (!session.rest_started_at) return null;
    const total = session.rest_seconds || DEFAULT_REST_SECONDS;
    const elapsed = (nowMs - new Date(session.rest_started_at).getTime()) / 1000;
    return { remaining: Math.max(0, Math.ceil(total - elapsed)), total };
  }

  // "24:10", or "1:05:10" past the hour.
  function elapsedText(startedAt, nowMs = Date.now()) {
    const seconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  // "3-1-1-0" -> "Tempo 3-1-1-0: 3 s down, 1 s pause, 1 s up." (the last digit is a hold at the top).
  function tempoText(tempo) {
    const parts = String(tempo || "").split("-").map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    const [down, pause, up, top = 0] = parts;
    const bits = [`${down} s down`, pause ? `${pause} s pause` : "no pause", up ? `${up} s up` : "explode up"];
    if (top) bits.push(`${top} s squeeze at the top`);
    return `Tempo ${tempo}: ${bits.join(", ")}.`;
  }

  return {
    DEFAULT_REST_SECONDS, BUILT_ROWS,
    isBuilt, buildSteps, stepKeys, stepSets, stepHasSets, firstOpenStep, stepName,
    prescribedSets, creditedSets, finishCheck,
    restSecondsFor, restState, elapsedText, tempoText,
  };
})();
