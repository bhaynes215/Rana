// Reference data loader.
// The exercise library, splits, workouts and slots are static: they ship
// with the app and never change at runtime, so they live in data/*.json
// (built by scripts/build_library.py) instead of localStorage.
//
// Speed: every screen is its own page, so without a cache each tap to a new
// screen would wait for these files again and the content would pop in.
// Instead the raw files are kept in sessionStorage (it lives as long as the
// browser tab). Rana.data.peek() then builds everything synchronously, so a
// screen can render in its very first frame. After rendering, revalidate()
// re-downloads the files in the background and, if the library was rebuilt
// since, saves the new copy for the next screen.
//
// Why fetch() needs a server: browsers block fetch() against file:// URLs
// for security reasons, so opening a page by double-clicking the HTML file
// fails. Run a local server from the project folder instead:
// `python3 -m http.server`, then visit http://127.0.0.1:8000.

window.Rana = window.Rana || {};

Rana.data = (() => {
  const FILES = ["exercises", "splits", "workouts", "slots", "exercise_limitations"];
  const CACHE_KEY = "rana:data-cache:v1";
  let built = null; // the lookup maps, once built in this page

  const fetchTexts = () =>
    Promise.all(FILES.map((name) => fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${name}.json (${r.status})`);
      return r.text();
    }))).then((texts) => Object.fromEntries(FILES.map((name, i) => [name, texts[i]])));

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null; // storage blocked or corrupt: just fetch instead
    }
  }
  function writeCache(texts) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(texts));
    } catch {
      // storage full or blocked: the cache is an optimization, never required
    }
  }

  // Turns the raw files into the lookup maps the screens use.
  function build(texts) {
    const json = (name) => JSON.parse(texts[name]);
    const exercises = json("exercises");
    const splits = json("splits");
    const workouts = json("workouts");
    const slotsDoc = json("slots");
    const limitationsDoc = json("exercise_limitations");

    // exercise_key -> ["knee", "lower-back", ...]. Used only to pick the
    // SUGGESTED workout's exercises around a user's reported limitations;
    // freestyle workouts and swap options ignore it (see plan.js).
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

    return {
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
  }

  // Synchronous: the data if it is already available without waiting
  // (built earlier in this page, or cached from an earlier screen), else null.
  function peek() {
    if (built) return built;
    const texts = readCache();
    if (!texts || FILES.some((name) => typeof texts[name] !== "string")) return null;
    try {
      built = build(texts);
    } catch {
      return null; // a bad cache is ignored and replaced by load()
    }
    return built;
  }

  // The data, waiting for the network only if nothing is cached yet.
  async function load() {
    const ready = peek();
    if (ready) return ready;
    const texts = await fetchTexts();
    writeCache(texts);
    built = build(texts);
    return built;
  }

  // Background check that the cached files still match the server's. If the
  // library was rebuilt, the new files are saved for the next screen (this
  // screen keeps what it already rendered).
  async function revalidate() {
    try {
      const fresh = await fetchTexts();
      const cached = readCache();
      if (!cached || FILES.some((name) => cached[name] !== fresh[name])) writeCache(fresh);
    } catch {
      // offline or a server hiccup: keep the cache
    }
  }

  return { load, peek, revalidate };
})();
