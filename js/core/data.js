// Reference data loader.
// The exercise library, splits, workouts and slots are static — they ship
// with the app and never change at runtime, so they live in data/*.json
// (built by scripts/build_library.py) instead of localStorage. This module
// fetches them once and caches the result in memory for the rest of the
// page's life.
//
// Why fetch() needs a server: browsers block fetch() against file:// URLs
// for security reasons, so opening any page that calls Rana.data.load() by
// double-clicking the HTML file will fail silently. Run a local server from
// the project folder instead — `python3 -m http.server` — then visit
// http://localhost:8000.

window.Rana = window.Rana || {};

Rana.data = (() => {
  let cache = null;

  async function load() {
    if (cache) return cache;

    const [exercises, splits, workouts, slotsDoc, limitationsDoc] = await Promise.all([
      fetch("data/exercises.json").then((r) => r.json()),
      fetch("data/splits.json").then((r) => r.json()),
      fetch("data/workouts.json").then((r) => r.json()),
      fetch("data/slots.json").then((r) => r.json()),
      fetch("data/exercise_limitations.json").then((r) => r.json()),
    ]);

    // exercise_key -> ["knee", "lower-back", ...]. Used only to pick the
    // SUGGESTED workout's exercises around a user's reported limitations;
    // freestyle workouts and swap buttons ignore it (see plan.js).
    const limitationsByExercise = new Map(Object.entries(limitationsDoc.tags));

    const exerciseByKey = new Map(exercises.map((e) => [e.exercise_key, e]));
    const splitById = new Map(splits.map((s) => [s.split_id, s]));
    const workoutById = new Map(workouts.map((w) => [w.workout_id, w]));

    // Each split lists its days in order (`workout_ids`, built by
    // scripts/build_library.py). A split can reuse another split's days, e.g.
    // the 6-day PPL + Arnold split is the PPL A days followed by the Arnold days.
    const workoutsBySplit = new Map(
      splits.map((s) => [s.split_id, (s.workout_ids || []).map((id) => workoutById.get(id)).filter(Boolean)])
    );

    const slotsByWorkout = new Map();
    slotsDoc.slots.forEach((s) => {
      const list = slotsByWorkout.get(s.workout_id) || [];
      list.push(s);
      slotsByWorkout.set(s.workout_id, list);
    });
    slotsByWorkout.forEach((list) => list.sort((a, b) => a.slot_order - b.slot_order));

    const optionsBySlot = new Map();
    slotsDoc.slot_options.forEach((o) => {
      const list = optionsBySlot.get(o.slot_id) || [];
      list.push(o);
      optionsBySlot.set(o.slot_id, list);
    });
    optionsBySlot.forEach((list) => list.sort((a, b) => a.option_rank - b.option_rank));

    cache = {
      exercises,
      splits,
      workouts,
      slots: slotsDoc.slots,
      slotOptions: slotsDoc.slot_options,
      exerciseByKey,
      splitById,
      workoutById,
      workoutsBySplit,
      slotsByWorkout,
      optionsBySlot,
      limitationsByExercise,
    };
    // The saved plan may point at a split that was since removed from the
    // workbook; fix it before any screen reads it (see Rana.plan.repairPlan).
    if (Rana.plan && Rana.storage) Rana.plan.repairPlan(cache);
    return cache;
  }

  return { load };
})();
