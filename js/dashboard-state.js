// Assembles everything the dashboard renders into one plain object, so
// dashboard.js never has to touch storage, the plan, or the XP math itself.
//
// This file used to be a second localStorage-reading module (js/storage.js).
// As of 2026-11-25 it reads through Rana.storage (the root storage.js) like
// every other screen, so there is exactly ONE place that touches
// localStorage. It still leans on data.js / plan.js / game.js for the
// exercise-library lookups and the schedule/XP math — it doesn't
// reimplement any of that, it only assembles the final shape.

window.Rana = window.Rana || {};

Rana.dashboard = (() => {
  // The dashboard mockup's "Day 1 — nothing logged" state, updated for the
  // 2026-11-25 leveling rebuild: Spark tier, Level 1, every stat at 0
  // (nobody gets starting stats). Stat targets are filled in at runtime
  // from the same 12-week projection real users see (3 days/week, matching
  // this fixture's Legs/Push/Pull week).
  const FIXTURE = {
    name: "RANA",
    tier: "SPARK",
    title: null,
    level: 1,
    xpIntoLevel: 0,
    xpLevelSpan: 44,
    recovery: null,
    streak: 0,
    sessionsLogged: 0,
    nextTier: "Ignition · LV 5",
    weekNumber: 1,
    stats: null, // filled in by getDashboardState()
    inProgress: null,
    today: {
      isRestDay: false,
      dayName: "Legs",
      focusMuscles: "Quadriceps · Hamstrings · Glutes · Calves",
      slotCount: 6,
      workingSets: 20,
      estMinutes: 75,
      statYield: ["STR", "VIT"],
      completed: false,
      summarySessionId: null,
      limitationNote: null,
    },
    week: [
      { weekday: "Mon", state: "rest", label: "" },
      { weekday: "Tue", state: "today", label: "LEGS" },
      { weekday: "Wed", state: "rest", label: "" },
      { weekday: "Thu", state: "planned", label: "PUSH" },
      { weekday: "Fri", state: "planned", label: "PULL" },
      { weekday: "Sat", state: "rest", label: "" },
      { weekday: "Sun", state: "rest", label: "" },
    ],
  };

  function titleCase(word) {
    return word.charAt(0) + word.slice(1).toLowerCase();
  }

  // A short caption for the microcycle strip ("Push Day A (Chest Focus)"
  // -> "PUSH"). The real workout names are longer than the mockup's
  // one-word examples, so this is a first-pass abbreviation, not an
  // authored short name — 4 letters (not more) specifically to avoid
  // truncations that accidentally read as a real word, e.g. "Shoulders"
  // at 6 chars becomes "SHOULD", which looks like a typo, not a label.
  // Still worth an authored short-name field per split eventually.
  function shortLabel(dayName) {
    const firstWord = (dayName || "").split(/[^A-Za-z]+/)[0] || "";
    return firstWord.slice(0, 4).toUpperCase();
  }

  // "Adjusted for your knee." / "Some exercises load your knee — go light."
  function limitationNoteFor(slots, data, limitations) {
    if (limitations.length === 0) return null;
    let adjusted = false;
    const cautionJoints = new Set();
    Rana.plan.suggestWorkout(slots, data, limitations).forEach((pick) => {
      if (pick.substituted) adjusted = true;
      pick.caution.forEach((j) => cautionJoints.add(j));
    });
    const parts = [];
    if (adjusted) parts.push(`Some exercises were swapped to work around your ${limitations.map((l) => l.replace("-", " ")).join(" / ")}.`);
    if (cautionJoints.size) parts.push(`A few still load your ${[...cautionJoints].map((j) => j.replace("-", " ")).join(" / ")}: go light.`);
    return parts.join(" ") || null;
  }

  async function computeRealState(profile, savedPlan) {
    const data = await Rana.data.load();
    // Re-read: loading the data may have repaired a plan whose split was removed.
    const plan = Rana.storage.getPlan() || savedPlan;

    // Only FINISHED workouts count toward XP, stats and recovery.
    const finishedSessions = Rana.storage.getFinishedSessions();
    const finishedSets = Rana.storage.getFinishedSets();
    const sessionsByDate = new Map();
    finishedSessions.forEach((s) => {
      const list = sessionsByDate.get(s.date) || [];
      list.push(s);
      sessionsByDate.set(s.date, list);
    });

    // XP, level, tier, streak and title all come from replaying the full
    // history through the XP ledger (game.js) — nothing is stored.
    const ledger = Rana.game.computeXpLedger(finishedSets, finishedSessions, plan, data);
    const xp = ledger.totalXp;
    const level = Rana.game.levelForXp(xp);
    const tier = Rana.game.tierForLevel(level);
    const title = Rana.game.currentTitle(ledger);

    // The XP bar shows progress through the CURRENT level (e.g. 120 / 141),
    // not lifetime totals — otherwise at Level 30 the bar would read
    // something like 40,000 / 42,000 and look permanently almost-full.
    const levelStartXp = Rana.game.xpForLevel(level);
    const xpIntoLevel = xp - levelStartXp;
    const xpLevelSpan = Rana.game.xpForLevel(level + 1) - levelStartXp;

    // Everyone starts at 0; stats only come from logged work.
    const projected = Rana.game.computeProjectedStats(profile);
    const points = Rana.game.computeStatPoints(finishedSets, data.exerciseByKey);
    const stats = ["STR", "AGI", "VIT"].map((key) => ({
      key,
      current: Rana.game.statValue(points[key]),
      target: projected[key],
    }));

    const recovery = Rana.game.computeRecovery(finishedSets, plan, Rana.storage.getDifficultyByDate());

    const tierIndex = Rana.game.TIERS.findIndex((t) => t.name === tier);
    const nextTierDef = Rana.game.TIERS[tierIndex + 1];
    const nextTier = nextTierDef
      ? `${titleCase(nextTierDef.name)} · LV ${nextTierDef.minLevel}`
      : "Max tier reached";

    const startDate = new Date(plan.start_date + "T00:00:00");
    const now = new Date();
    const dayDiff = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.max(1, Math.floor(dayDiff / 7) + 1);

    // --- A workout already in progress (today's, or one left over from an earlier day) ---
    const inProgressSession = Rana.storage.getInProgressSession();
    const todayStr = Rana.plan.todayStr();
    const inProgress = inProgressSession
      ? {
          sessionId: inProgressSession.session_id,
          title: Rana.plan.sessionTitle(inProgressSession, data),
          type: inProgressSession.type,
          date: inProgressSession.date,
          isFromEarlierDay: inProgressSession.date < todayStr,
        }
      : null;

    // --- Today ---
    const todayFinished = sessionsByDate.get(todayStr) || [];
    const todaySession = Rana.plan.getSessionForDate(todayStr, plan, data, todayFinished);
    const limitations = Rana.plan.activeLimitations(profile);
    const lastFinishedToday = todayFinished[todayFinished.length - 1] || null;
    const plannedFinishedToday = todayFinished.find((s) => s.type === "planned") || null;

    let today;
    if (todaySession.isRestDay) {
      today = {
        isRestDay: true,
        trainedToday: todayFinished.length > 0,
        summarySessionId: lastFinishedToday ? lastFinishedToday.session_id : null,
      };
    } else if (todaySession.isOwnWorkout) {
      // A day in the user's own plan: just its name. There's no exercise list
      // to count or time, because they build the workout while logging.
      today = {
        isRestDay: false,
        isOwnWorkout: true,
        dayName: todaySession.workout.day_name,
        focusMuscles: "You build this workout",
        statYield: [],
        completed: todaySession.status === "completed",
        trainedToday: todayFinished.length > 0,
        summarySessionId: (plannedFinishedToday || lastFinishedToday || {}).session_id || null,
        limitationNote: null,
      };
    } else {
      const slots = todaySession.slots;
      // The SUGGESTED exercise for each slot: the main one, unless it loads
      // a joint the user reported a limitation on (see plan.js).
      const primaryExercises = Rana.plan
        .suggestWorkout(slots, data, limitations)
        .map((pick) => (pick.exerciseKey ? data.exerciseByKey.get(pick.exerciseKey) : null))
        .filter(Boolean);

      const muscleGroups = [...new Set(primaryExercises.map((e) => e.muscle_group))];
      const workingSets = slots.reduce((sum, s) => sum + s.working_sets, 0);
      const hasCompound = primaryExercises.some((e) => e.is_compound);
      const hasUnilateral = primaryExercises.some((e) => e.is_unilateral);

      const statYield = ["VIT"]; // every completed session yields VIT (PRD 7.1)
      if (hasCompound) statYield.unshift("STR");
      if (hasUnilateral) statYield.push("AGI");

      today = {
        isRestDay: false,
        dayName: todaySession.workout.day_name,
        focusMuscles: muscleGroups.join(" · "),
        slotCount: slots.length,
        workingSets,
        estMinutes: todaySession.workout.est_session_minutes,
        statYield,
        completed: todaySession.status === "completed",
        trainedToday: todayFinished.length > 0,
        summarySessionId: (plannedFinishedToday || lastFinishedToday || {}).session_id || null,
        limitationNote: limitationNoteFor(slots, data, limitations),
      };
    }

    // --- Week strip: Mon-Sun containing today ---
    const dowMonFirst = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dowMonFirst);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = Rana.plan.toDateStr(d);
      const session = Rana.plan.getSessionForDate(dateStr, plan, data, sessionsByDate.get(dateStr) || []);

      let state;
      if (session.isRestDay) state = "rest";
      else if (session.status === "completed") state = "done";
      else if (session.status === "off-plan") state = "off-plan"; // trained something else instead
      else if (session.status === "today") state = "today";
      else if (session.status === "missed") state = "missed";
      else state = "planned"; // upcoming, or a training weekday before plan.start_date

      week.push({
        weekday: Rana.plan.WEEKDAY_ORDER[i],
        state,
        label: session.isRestDay ? "" : shortLabel(session.workout.day_name),
      });
    }

    return {
      name: profile.name,
      tier,
      title: title ? title.name : null,
      level,
      xpIntoLevel,
      xpLevelSpan,
      recovery,
      // Streak = consecutive suggested workouts done as prescribed, from the
      // XP ledger (rest days don't count either way; a miss halves it;
      // training off-plan holds it).
      streak: ledger.currentStreak,
      sessionsLogged: finishedSessions.length,
      nextTier,
      weekNumber,
      stats,
      inProgress,
      today,
      week,
    };
  }

  async function getDashboardState() {
    const profile = Rana.storage.getProfile();
    const plan = Rana.storage.getPlan();

    if (!profile || !plan || plan.status !== "active") {
      console.warn(
        "Rana.dashboard.getDashboardState: no active profile/plan in localStorage — " +
        "showing the day-1 fixture instead of real data. Complete the questionnaire " +
        "(onboarding.html) through the results screen's lock-in to wire this up."
      );
      const projected = Rana.game.computeProjectedStats({ training_days_per_week: 3 });
      return {
        ...FIXTURE,
        stats: ["STR", "AGI", "VIT"].map((key) => ({ key, current: 0, target: projected[key] })),
      };
    }

    return computeRealState(profile, plan);
  }

  return { getDashboardState };
})();
