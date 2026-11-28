// Read models for Progress, Today and the logging screen: plain functions
// that turn saved sessions, sets and the XP ledger into the numbers a screen
// shows. Nothing here touches the page or storage; screens pass data in.
//
//   Rana.progress.liftRows({ lifts, ledger, data })       one row per main lift (Progress)
//   Rana.progress.weeklyXp(ledger, today, weeks)           XP per week and levels reached (Progress)
//   Rana.progress.exerciseHistory(key, { sets, sessions }) every finished session of one exercise
//   Rana.progress.lastTime(key, { sets, sessions })        the previous session's sets (the "Last time" column)
//   Rana.progress.recentSessions({ sessions, sets, ledger }, n)
//
// Per-exercise history is the foundation of the agreed "per-exercise history"
// feature (tap an exercise, see every session, the best and the trend):
// exerciseHistory() and ledger.lifts[key].history are what it will read.

window.Rana = window.Rana || {};

Rana.progress = (() => {
  // ---------------------------------------------------------------------
  // Dates (local, "YYYY-MM-DD" strings, like the rest of the app)
  // ---------------------------------------------------------------------
  function addDays(dateStr, n) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + n);
    return Rana.plan.toDateStr(d);
  }

  // The Monday of the week a date falls in.
  function mondayOf(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return addDays(dateStr, -((d.getDay() + 6) % 7));
  }

  // ---------------------------------------------------------------------
  // Strength rows
  // ---------------------------------------------------------------------
  // One row per main lift. `lifts` comes from Rana.plan.mainLifts().
  //   state "tracking"     has a target: show start, current, target and the bar
  //   state "calibrating"  logged but no target yet (the starting-lift answer
  //                        was skipped): "finding your starting weight, 2 of 3"
  //   state "not-logged"   nothing yet
  // Values are rounded for display (lb to whole pounds). `history` is each
  // session's best score, oldest first, for the "fastest lift" tip.
  function liftRows({ lifts, ledger, data }) {
    const calibration = Rana.game.XP_RULES.CALIBRATION_SESSIONS;
    return lifts.map((lift) => {
      const exercise = data.exerciseByKey.get(lift.exercise_key);
      const record = ledger.lifts.get(lift.exercise_key) || null;
      const row = {
        exerciseKey: lift.exercise_key,
        name: exercise ? exercise.exercise_name : lift.exercise_key,
        unit: record ? record.unit : lift.unit,
        state: "not-logged",
        current: null, start: null, target: null, delta: null,
        sessions: record ? record.sessions : 0,
        calibrationOf: calibration,
        history: record ? record.history.map((h) => ({ date: h.date, score: h.score })) : [],
      };
      if (!record) return row;

      if (record.target) {
        row.state = "tracking";
        row.start = Math.round(record.start);
        row.current = Math.round(record.sessions > 0 ? record.best : record.start);
        row.target = record.target.value;
        row.delta = row.current - row.start;
      } else if (record.sessions > 0) {
        row.state = "calibrating";
        row.current = Math.round(record.best);
      }
      return row;
    });
  }

  // ---------------------------------------------------------------------
  // Weekly XP (the Level history bars)
  // ---------------------------------------------------------------------
  // The last `weeks` Monday-to-Sunday weeks, oldest first, the current week
  // last. `levelReached` is the new level if the week crossed one, else null.
  function weeklyXp(ledger, today, weeks = 5) {
    const thisMonday = mondayOf(today);
    const dates = [...ledger.entries.keys()];
    const xpBetween = (from, to) =>
      dates.reduce((sum, d) => (d >= from && d <= to ? sum + ledger.entries.get(d).totalXp : sum), 0);

    const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = addDays(thisMonday, -7 * i);
      const before = xpBetween("0000-01-01", addDays(weekStart, -1));
      const xp = xpBetween(weekStart, addDays(weekStart, 6));
      const levelBefore = Rana.game.levelForXp(before);
      const levelAfter = Rana.game.levelForXp(before + xp);
      out.push({ weekStart, xp, level: levelAfter, levelReached: levelAfter > levelBefore ? levelAfter : null });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // One exercise's history
  // ---------------------------------------------------------------------
  // Every finished session that logged this exercise, newest first, each with
  // that exercise's sets in order: [{ session, sets }]. `sessions` and `sets`
  // are the FINISHED ones. `excludeSessionId` leaves out the workout in
  // progress, so "last time" never means "this time".
  function exerciseHistory(exerciseKey, { sets, sessions }, excludeSessionId = null) {
    const bySession = new Map();
    for (const set of sets) {
      if (set.exercise_key !== exerciseKey || set.session_id === excludeSessionId) continue;
      const list = bySession.get(set.session_id) || [];
      list.push(set);
      bySession.set(set.session_id, list);
    }
    return sessions
      .filter((s) => bySession.has(s.session_id))
      .sort((a, b) => (b.date + (b.started_at || "")).localeCompare(a.date + (a.started_at || "")))
      .map((session) => ({
        session,
        sets: bySession.get(session.session_id).sort((a, b) => (a.set_index || 0) - (b.set_index || 0)),
      }));
  }

  // The previous session's sets for an exercise, in order: [{ weight, reps }].
  // Empty if it has never been done.
  function lastTime(exerciseKey, source, excludeSessionId = null) {
    const history = exerciseHistory(exerciseKey, source, excludeSessionId);
    return history.length ? history[0].sets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })) : [];
  }

  // 135 × 8; a bodyweight set (no added weight) is just "8 reps".
  function formatSet({ weight, reps }) {
    return weight > 0 ? `${Number(weight)} × ${reps}` : `${reps} reps`;
  }

  // ---------------------------------------------------------------------
  // Recent workouts
  // ---------------------------------------------------------------------
  // The newest finished workouts with the XP each earned: [{ session, xp, setCount }].
  function recentSessions({ sessions, sets, ledger }, count = 3) {
    const counts = new Map();
    for (const set of sets) counts.set(set.session_id, (counts.get(set.session_id) || 0) + 1);
    return [...sessions]
      .sort((a, b) => (b.date + (b.started_at || "")).localeCompare(a.date + (a.started_at || "")))
      .slice(0, count)
      .map((session) => ({ session, xp: Rana.game.xpForSession(ledger, session), setCount: counts.get(session.session_id) || 0 }));
  }

  return { addDays, mondayOf, liftRows, weeklyXp, exerciseHistory, lastTime, formatSet, recentSessions };
})();
