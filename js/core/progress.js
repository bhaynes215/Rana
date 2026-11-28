// Read models for Progress, Today and the logging screen: plain functions
// that turn saved sessions, sets and the XP ledger into the numbers a screen
// shows. Nothing here touches the page or storage; screens pass data in.
//
//   Rana.progress.liftRows({ lifts, ledger, data })       one row per main lift (Progress)
//   Rana.progress.weeklyXp(ledger, today, weeks)           XP per week and levels reached (Progress)
//   Rana.progress.exerciseHistory(key, { sets, sessions }) every finished session of one exercise
//   Rana.progress.lastTime(key, { sets, sessions })        the previous session's sets (the "Last time" column)
//   Rana.progress.recentSessions({ sessions, sets, ledger }, n)
//   Rana.progress.workoutSummary({ session, sessions, sets, plan, data, profile })   what one workout earned
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

  // ---------------------------------------------------------------------
  // The summary of one finished workout
  // ---------------------------------------------------------------------
  // The XP ledger is run twice: over the whole history, and over the history
  // WITHOUT this workout. The difference is what the workout earned, and
  // comparing the two also shows whether it crossed a level or earned a
  // title. Nothing is stored; see the design note at the top of game.js.
  //
  // `sessions` and `sets` are ALL finished ones (this workout included).
  // Returns:
  //   gained                      the XP this workout earned
  //   lines                       [{ kind, label, detail, xp }] in the order they land:
  //                               "session", "streak", "best", "target"
  //   notes                       plain sentences for anything that earned no session XP
  //   increases, targetHits       the raw strength increases and target hits
  //   before, after               { xp, level, levelStartXp, nextLevelXp } for the level bar
  //   levelBefore, levelAfter, tierBefore, tierAfter, newTitles
  //   restDay                     the workout was on a rest day
  function workoutSummary({ session, sessions, sets, plan, data, profile = null, today }) {
    const rules = Rana.game.XP_RULES;
    const ledgerOf = (s, x) => Rana.game.computeXpLedger({ sets: x, sessions: s, plan, data, profile, today });
    // "After" means as of THIS workout: later workouts are left out, so looking
    // back at an old workout shows the level it reached then, not today's.
    const later = (x) => x.date > session.date || (x.date === session.date && (x.started_at || "") > (session.started_at || ""));
    const laterIds = new Set(sessions.filter(later).map((x) => x.session_id));
    const upTo = sessions.filter((x) => !laterIds.has(x.session_id));
    const upToSets = sets.filter((x) => !laterIds.has(x.session_id));
    const after = ledgerOf(upTo, upToSets);
    const without = ledgerOf(upTo.filter((x) => x.session_id !== session.session_id), upToSets.filter((x) => x.session_id !== session.session_id));

    const entry = after.entries.get(session.date);
    const sessionEntry = after.sessionEntries.get(session.session_id) || { increases: [], targetHits: [] };
    const nameOf = (key) => (data.exerciseByKey.get(key) || {}).exercise_name || key;
    const own = session.type === "planned" && session.workout_id === Rana.plan.OWN_WORKOUT;

    const lines = [];
    const notes = [];
    const earnedHere = entry && entry.xpSessionId === session.session_id;
    if (earnedHere) {
      lines.push({ kind: "session", label: "Workout completed", detail: entry.completed ? "" : "off-plan", xp: entry.sessionXp });
      if (entry.completed && entry.streakBonusXp > 0) lines.push({ kind: "streak", label: "Streak bonus", detail: `${entry.streak} in a row`, xp: entry.streakBonusXp });
      if (entry.offPlan) notes.push("Off-plan workout: your streak is held, not grown.");
    } else if (entry && entry.xpSessionId) {
      notes.push("Today's session XP was already earned by another workout.");
    } else if (entry && entry.restDay) {
      notes.push("Rest day: strength XP only. Rest is part of the plan.");
    } else if (own) {
      notes.push(`Log at least ${rules.FREESTYLE_MIN_SETS} sets for it to count as following your plan.`);
    } else if (session.type === "planned") {
      notes.push("Under half the suggested workout was logged, so it didn't count as following the plan.");
    } else {
      notes.push(`Log at least ${rules.FREESTYLE_MIN_SETS} sets to earn session XP.`);
    }
    [...sessionEntry.increases].sort((a, b) => a.xp - b.xp).forEach((inc) => {
      lines.push({ kind: "best", label: `New best: ${nameOf(inc.exerciseKey)}`, detail: `+${inc.percent.toFixed(1)}%${inc.mode === "bodyweight" ? " reps" : ""}`, xp: inc.xp });
    });
    sessionEntry.targetHits.forEach((hit) => {
      lines.push({ kind: "target", label: `Target hit: ${nameOf(hit.exerciseKey)}`, detail: `${hit.value} ${hit.unit}`, xp: hit.xp });
    });

    const bar = (xp) => {
      const level = Rana.game.levelForXp(xp);
      return { xp, level, levelStartXp: Rana.game.xpForLevel(level), nextLevelXp: Rana.game.xpForLevel(level + 1) };
    };
    const before = bar(without.totalXp);
    const afterBar = bar(after.totalXp);
    const titlesBefore = new Set(Rana.game.earnedTitles(without).map((t) => t.name));

    return {
      gained: after.totalXp - without.totalXp,
      lines, notes,
      increases: sessionEntry.increases,
      targetHits: sessionEntry.targetHits,
      before, after: afterBar,
      levelBefore: before.level, levelAfter: afterBar.level,
      tierBefore: Rana.game.tierForLevel(before.level), tierAfter: Rana.game.tierForLevel(afterBar.level),
      newTitles: Rana.game.earnedTitles(after).filter((t) => !titlesBefore.has(t.name)),
      restDay: Boolean(entry && entry.restDay),
    };
  }

  return { addDays, mondayOf, liftRows, weeklyXp, exerciseHistory, lastTime, formatSet, recentSessions, workoutSummary };
})();
