// The one module allowed to touch localStorage directly (PRD section 6).
// Every screen goes through Rana.storage.* instead of calling
// localStorage.getItem/setItem itself — so when this moves to a real
// database later, this is the only file that has to change.
//
// What's saved here is the small, ever-changing stuff: the user's answers,
// the plan they were assigned, and their workouts.
// Reference data (exercises, splits) never comes through here — see data.js.
//
// WORKOUTS ARE TWO LISTS, LINKED BY session_id (updated 2026-11-25):
//   - sessions: one entry per workout — the "page in the logbook". Holds the
//     title, whether it was the suggested workout ("planned") or the user's
//     own ("freestyle"), when it started and finished, and (for freestyle)
//     the exercises they added.
//   - logged sets: one entry per set actually performed, each pointing at
//     its session via session_id.
// They're kept separate on purpose: that's exactly how they'll become two
// tables in a real database later, so moving to Supabase is a copy, not a
// redesign.
//
// A session is "in progress" from the moment the user taps Start until they
// tap Finish (finished_at is null until then). Only FINISHED sessions count
// toward XP and stats — see getFinishedSets() below — so closing the tab
// mid-workout never loses anything, and never half-awards XP either.
//
// Known limits (also called out in CLAUDE.md): localStorage is per-browser,
// per-device, holds ~5MB, and is wiped if the user clears site data. Fine
// for an MVP, but nothing here should be presented as durably "saved."

window.Rana = window.Rana || {};

Rana.storage = (() => {
  const KEYS = {
    profile: "rana:v1:profile",
    plan: "rana:v1:plan",
    // The user's two plan definitions: Rana's suggested one and (optionally)
    // one they built themselves. Only one is active; the active one is copied
    // into `plan` above, which is what every screen reads.
    savedPlans: "rana:v1:saved_plans",
    loggedSets: "rana:v1:logged_sets",
    sessions: "rana:v1:sessions",
    // Legacy: difficulty used to be saved per DATE here. It now lives on the
    // session itself; this key is only read once, during migration below.
    sessionFeedback: "rana:v1:session_feedback",
  };

  const WEEKDAYS_SUN_FIRST = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn(`Rana.storage: couldn't read ${key}, using fallback.`, e);
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // --- Profile (the questionnaire's answers) ---
  // The questionnaire used to save its number answers as text ("21"); older
  // saved profiles still have them that way. Every read goes through
  // normalizeProfile, so the rest of the app only ever sees real numbers.
  //   starting_lifts: { [exercise_key]: { weight, reps } | { skipped: true } }
  //   (the "recent set" answers; they only set Progress goals, never the plan).
  const NUMBER_FIELDS = ["age", "height", "weight_current", "weight_target", "training_days_per_week"];

  function normalizeProfile(profile) {
    if (!profile) return null;
    const out = { ...profile };
    for (const field of NUMBER_FIELDS) {
      const value = out[field];
      out[field] = value === null || value === undefined || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
    }
    out.limitations = Array.isArray(out.limitations) ? out.limitations : [];
    out.starting_lifts = out.starting_lifts && typeof out.starting_lifts === "object" ? out.starting_lifts : {};
    return out;
  }

  function getProfile() {
    return normalizeProfile(read(KEYS.profile, null));
  }
  function saveProfile(profile) {
    write(KEYS.profile, profile);
  }

  // --- Plan (which split was assigned, and which weekdays are training days) ---
  function getPlan() {
    return read(KEYS.plan, null);
  }
  function savePlan(plan) {
    write(KEYS.plan, plan);
  }

  // --- Saved plans: { rana: {...} | null, own: {...} | null } ---
  //   rana: { plan_id: "rana", kind: "suggested", split_id, training_weekdays, weekday_map }
  //   own:  { plan_id: "own", kind: "own", name, weekday_map, own_day_names, created_at }
  // Users from before 2026-11-27 have no saved plans yet: their current plan
  // becomes the saved "rana" plan the first time this is read.
  function getSavedPlans() {
    const saved = read(KEYS.savedPlans, null);
    if (saved) return { rana: saved.rana || null, own: saved.own || null };
    const plan = getPlan();
    const migrated = { rana: null, own: null };
    if (plan && (plan.active_plan_id || "rana") === "rana") {
      migrated.rana = {
        plan_id: "rana",
        kind: "suggested",
        split_id: plan.split_id,
        training_weekdays: plan.training_weekdays,
        weekday_map: { ...plan.weekday_map },
      };
      write(KEYS.savedPlans, migrated);
    }
    return migrated;
  }
  function saveSavedPlan(def) {
    const saved = getSavedPlans();
    saved[def.plan_id] = def;
    write(KEYS.savedPlans, saved);
  }
  function deleteSavedPlan(planId) {
    const saved = getSavedPlans();
    saved[planId] = null;
    write(KEYS.savedPlans, saved);
  }
  // A fresh questionnaire starts over: Rana's new plan, no own plan.
  function resetSavedPlans(ranaDef) {
    write(KEYS.savedPlans, { rana: ranaDef, own: null });
  }

  // --- Migration of older data ---
  // 1. Before sessions existed, sets were saved with just a date. Any set
  //    with no session_id is grouped by date into one finished session each,
  //    so nothing from before is lost.
  // 2. Before sets could be edited, they had no id of their own. Any set
  //    without a set_id gets one (two sets can otherwise look identical,
  //    e.g. the same exercise in two slots).
  // Safe to run any number of times: once every set has both, there's
  // nothing left to do.
  function migrateLegacySets() {
    const sets = read(KEYS.loggedSets, []);
    if (sets.every((s) => s.session_id && s.set_id)) return;

    sets.forEach((s) => {
      if (!s.set_id) s.set_id = newSetId();
    });
    const orphans = sets.filter((s) => !s.session_id);
    if (orphans.length === 0) {
      write(KEYS.loggedSets, sets);
      return;
    }

    const plan = read(KEYS.plan, null);
    const feedback = read(KEYS.sessionFeedback, {});
    const sessions = read(KEYS.sessions, []);

    const byDate = new Map();
    orphans.forEach((s) => {
      const list = byDate.get(s.date) || [];
      list.push(s);
      byDate.set(s.date, list);
    });

    byDate.forEach((daySets, date) => {
      const id = newSessionId(date);
      const weekday = WEEKDAYS_SUN_FIRST[new Date(date + "T00:00:00").getDay()];
      const workoutId = plan && plan.weekday_map ? plan.weekday_map[weekday] || null : null;
      const times = daySets.map((s) => s.completed_at).filter(Boolean).sort();

      sessions.push({
        session_id: id,
        date,
        // A training-day workout becomes "planned"; anything else (a day
        // with no scheduled workout) becomes "freestyle".
        type: workoutId ? "planned" : "freestyle",
        title: workoutId ? null : "Workout", // planned titles come from the workout's own name
        workout_id: workoutId,
        started_at: times[0] || `${date}T12:00:00.000Z`,
        finished_at: times[times.length - 1] || `${date}T12:30:00.000Z`,
        exercises: workoutId ? [] : [...new Set(daySets.map((s) => s.exercise_key))],
        difficulty: feedback[date] ?? null,
      });
      daySets.forEach((s) => {
        s.session_id = id;
      });
    });

    write(KEYS.loggedSets, sets);
    write(KEYS.sessions, sessions);
  }

  // --- Sessions ---
  function newSessionId(dateStr) {
    return `s_${dateStr.replace(/-/g, "")}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function newSetId() {
    return `x_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function getSessions() {
    migrateLegacySets();
    return read(KEYS.sessions, []);
  }

  function getSession(sessionId) {
    return getSessions().find((s) => s.session_id === sessionId) || null;
  }

  function getFinishedSessions() {
    return getSessions().filter((s) => s.finished_at);
  }

  // At most one workout is in progress at a time.
  function getInProgressSession() {
    return getSessions().find((s) => !s.finished_at) || null;
  }

  // Creates the session the moment the user taps Start. `date` is the day it
  // STARTED, so a workout running past midnight doesn't split across two days.
  function startSession({ type, title, workout_id, date }) {
    const sessions = getSessions();
    const session = {
      session_id: newSessionId(date),
      date,
      type, // "planned" (the suggested workout) or "freestyle"
      title,
      workout_id: workout_id || null,
      started_at: new Date().toISOString(),
      finished_at: null,
      exercises: [], // freestyle only: exercise_keys in the order added
      difficulty: null,
      // The rest timer: when the last set was marked done and how long to
      // rest. Computed from the timestamp, so it survives closing the tab.
      rest_started_at: null,
      rest_seconds: null,
    };
    sessions.push(session);
    write(KEYS.sessions, sessions);
    return session;
  }

  function updateSession(sessionId, patch) {
    const sessions = getSessions();
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) return null;
    Object.assign(session, patch);
    write(KEYS.sessions, sessions);
    return session;
  }

  function finishSession(sessionId, difficulty) {
    return updateSession(sessionId, {
      finished_at: new Date().toISOString(),
      difficulty: difficulty ?? null,
    });
  }

  // Discarding (an unfinished workout) or deleting (a finished one from the
  // history) removes the session AND its sets. XP is recalculated from what's
  // left, so deleting a past workout takes its XP with it.
  function discardSession(sessionId) {
    write(KEYS.sessions, getSessions().filter((s) => s.session_id !== sessionId));
    write(KEYS.loggedSets, read(KEYS.loggedSets, []).filter((s) => s.session_id !== sessionId));
  }

  // --- Logged sets: one record per set actually performed ---
  // Stored as a flat array; date is a "YYYY-MM-DD" string so it sorts and
  // compares as plain text without needing a date-parsing library.
  function getAllLoggedSets() {
    migrateLegacySets();
    return read(KEYS.loggedSets, []);
  }
  function getSetsForSession(sessionId) {
    return getAllLoggedSets().filter((s) => s.session_id === sessionId);
  }
  function addLoggedSet(entry) {
    const all = getAllLoggedSets();
    const withId = { set_id: newSetId(), ...entry };
    all.push(withId);
    write(KEYS.loggedSets, all);
    return withId;
  }

  // --- Fixing mistakes (from the workout history) ---
  // A typo like 1000 lb instead of 100 would otherwise become that
  // exercise's "best" forever, and no later set could beat it. Because XP,
  // levels and stats are always recalculated from the logged sets, fixing a
  // set fixes everything downstream — including, possibly, lowering a level
  // that the typo inflated. That's intended: "levels never go down" means
  // never from training or resting, not from correcting your own data entry.
  function updateLoggedSet(setId, patch) {
    const all = getAllLoggedSets();
    const set = all.find((s) => s.set_id === setId);
    if (!set) return null;
    Object.assign(set, patch);
    write(KEYS.loggedSets, all);
    return set;
  }

  function deleteLoggedSet(setId) {
    write(KEYS.loggedSets, getAllLoggedSets().filter((s) => s.set_id !== setId));
  }

  // Sets from FINISHED sessions only — what XP, stats and recovery use.
  function getFinishedSets() {
    const finishedIds = new Set(getFinishedSessions().map((s) => s.session_id));
    return getAllLoggedSets().filter((s) => finishedIds.has(s.session_id));
  }

  // { "2026-11-25": 4, ... } — the one-tap difficulty rating by date, built
  // from the sessions (the recovery meter wants it that way).
  function getDifficultyByDate() {
    const out = {};
    getFinishedSessions().forEach((s) => {
      if (s.difficulty != null) out[s.date] = s.difficulty;
    });
    return out;
  }

  return {
    getProfile,
    normalizeProfile,
    saveProfile,
    getPlan,
    savePlan,
    getSavedPlans,
    saveSavedPlan,
    deleteSavedPlan,
    resetSavedPlans,
    getSessions,
    getSession,
    getFinishedSessions,
    getInProgressSession,
    startSession,
    updateSession,
    finishSession,
    discardSession,
    getAllLoggedSets,
    getSetsForSession,
    addLoggedSet,
    updateLoggedSet,
    deleteLoggedSet,
    getFinishedSets,
    getDifficultyByDate,
  };
})();
