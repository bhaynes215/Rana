// The game layer: XP, levels, tiers, earned titles, stats, calorie/macro
// display, recovery.
//
// The leveling rules below (XP sources, level curve, tiers, titles) were
// designed with the fitness expert on 2026-11-25 and are written up in full
// in docs/leveling-system.md. The specific numbers are placeholders to tune
// once real people use the app — they all live in XP_RULES so they're easy
// to find and change in one place.
//
// Design note: nothing about "current XP", "current level" or "current
// stats" is ever stored. Every time the app needs them, it replays the full
// history of logged sets (Rana.storage.getAllLoggedSets()) from scratch.
// That's what makes "levels and stats never go down" true by construction:
// the history only ever grows, so there's nothing for a later bug to
// accidentally lower — instead of a rule someone has to remember to enforce
// every time a number gets updated.

window.Rana = window.Rana || {};

Rana.game = (() => {
  // ---------------------------------------------------------------------
  // Tuning knobs. Every number the fitness expert might want to adjust.
  // ---------------------------------------------------------------------
  const XP_RULES = {
    // Consistency: XP for each completed training session.
    SESSION_XP: 100,
    // A session counts as "completed" once at least this share of its
    // prescribed sets are logged (0.5 = half).
    COMPLETION_THRESHOLD: 0.5,
    // Streak boost: +5% session XP per session in the streak...
    STREAK_STEP: 0.05,
    // ...counting at most this many sessions (10 × 5% = +50% max).
    STREAK_MAX_SESSIONS: 10,

    // Strength increases: XP for beating your all-time best on an exercise.
    XP_PER_PERCENT: 10, // 10 XP per 1% improvement
    MAX_XP_PER_EXERCISE: 60, // per exercise, per session
    // The first N sessions of each exercise only set your baseline.
    CALIBRATION_SESSIONS: 3,
    // Sets above this many reps don't count toward strength increases
    // (the estimated-max formula gets unreliable with very high reps).
    MAX_COUNTED_REPS: 15,

    // A freestyle (or cut-short) workout needs at least this many logged sets
    // to count as a real session: it earns flat session XP and holds the
    // streak. Below it, nothing — one set of curls isn't a workout.
    FREESTYLE_MIN_SETS: 3,

    // A strength gain this big (in %) gets the big "NEW RECORD" moment on the
    // summary screen. Smaller gains still earn their XP, just with a quieter pop.
    NEW_RECORD_PERCENT: 5,

    // INT ("following the plan") points per completed session. A stand-in
    // until PRD open question 13.3 (calibration / INT) is decided.
    INT_POINTS_PER_SESSION: 4,
  };

  // ---------------------------------------------------------------------
  // Levels and tiers
  // ---------------------------------------------------------------------

  // Total XP needed to reach level n = 44 × (n − 1)².
  // Level 1 needs 0 XP. Each level's gap is a bit bigger than the last, so
  // early levels come fast and later ones take real time. Tuned so a lifter
  // who trains 4 days a week without missing reaches Level 50 (Mythic) in
  // about 3 years — see docs/leveling-system.md for the simulation. (The
  // first estimate was 47; a full simulation through this file's real
  // rules showed that lands at Level 48 after 3 years, so it became 44.)
  const LEVEL_CURVE_FACTOR = 44;

  function xpForLevel(n) {
    return LEVEL_CURVE_FACTOR * Math.pow(n - 1, 2);
  }

  // The highest level whose XP requirement has been reached. The square
  // root undoes the curve above; the two while-loops just protect against
  // rounding at exact boundaries.
  function levelForXp(xp) {
    let level = Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_CURVE_FACTOR)) + 1;
    while (xpForLevel(level + 1) <= xp) level++;
    while (level > 1 && xpForLevel(level) > xp) level--;
    return level;
  }

  // Six tiers, an "awakening arc". Levels keep going past 50; Mythic is
  // simply the last named tier.
  const TIERS = [
    { name: "SPARK", minLevel: 1 },
    { name: "IGNITION", minLevel: 5 },
    { name: "AWAKENED", minLevel: 13 },
    { name: "ASCENDED", minLevel: 22 },
    { name: "TRANSCENDENT", minLevel: 36 },
    { name: "MYTHIC", minLevel: 50 },
  ];

  function tierForLevel(level) {
    let current = TIERS[0].name;
    for (const t of TIERS) {
      if (level >= t.minLevel) current = t.name;
    }
    return current;
  }

  // ---------------------------------------------------------------------
  // Strength scoring
  // ---------------------------------------------------------------------

  // Estimated one-rep max (the "Epley" formula): weight × (1 + reps ÷ 30).
  // It turns any weight × reps into one comparable number, so 185×7 can be
  // compared with 195×5. Example: 185×6 → 222, 185×7 → 228.2 (+2.8%).
  function estimatedOneRepMax(weight, reps) {
    return weight * (1 + reps / 30);
  }

  // Scores one exercise's sets from one day: the best set wins.
  // Returns null if no set qualifies (e.g. every set was over 15 reps).
  //
  // Bodyweight exercises (pull-ups, dips) are usually logged with 0 extra
  // weight, and 0 × anything is 0 — so for those we compare reps directly
  // instead (8 → 10 pull-ups = +25%). They're tracked as a separate record
  // from the weighted version, so adding a dip belt later starts a fresh
  // baseline rather than looking like a giant jump.
  function scoreExerciseDay(sets) {
    const counted = sets.filter(
      (s) => Number(s.reps) >= 1 && Number(s.reps) <= XP_RULES.MAX_COUNTED_REPS
    );
    if (counted.length === 0) return null;

    const weighted = counted.filter((s) => Number(s.weight) > 0);
    if (weighted.length > 0) {
      let bestSet = weighted[0];
      let best = estimatedOneRepMax(Number(bestSet.weight), Number(bestSet.reps));
      for (const s of weighted) {
        const e1rm = estimatedOneRepMax(Number(s.weight), Number(s.reps));
        if (e1rm > best) { best = e1rm; bestSet = s; }
      }
      return { mode: "weighted", score: best, bestSet: { weight: Number(bestSet.weight), reps: Number(bestSet.reps) } };
    }
    let bestSet = counted[0];
    for (const s of counted) {
      if (Number(s.reps) > Number(bestSet.reps)) bestSet = s;
    }
    return { mode: "bodyweight", score: Number(bestSet.reps), bestSet: { weight: 0, reps: Number(bestSet.reps) } };
  }

  // ---------------------------------------------------------------------
  // The XP ledger: replays the whole history, one calendar day at a time
  // ---------------------------------------------------------------------
  //
  // It reads FINISHED sessions only (a workout still in progress earns
  // nothing until the user taps Finish). The plan is a suggestion; the
  // streak boost is the reward for following it (rules set 2026-11-25):
  //
  //   Training day, suggested workout done (≥ half its prescribed sets):
  //     session XP + the streak boost; the streak GROWS.
  //   Training day, trained something else instead (freestyle, or a
  //     suggested workout cut short) with at least FREESTYLE_MIN_SETS sets:
  //     flat session XP, no boost; the streak HOLDS (neither grows nor halves).
  //   Rest day, any workout: NO session XP, streak untouched. (So the game
  //     never rewards skipping rest.)
  //   Training day in the past with nothing qualifying: missed — no session
  //     XP, and the streak is HALVED (not reset to 0).
  //   Today, nothing yet: nothing happens; the day isn't over.
  //
  // Session XP is earned at most once per day, however many workouts were
  // done. Strength increases are scored per session, on any day, planned or
  // freestyle: every exercise keeps one record (by exercise_key), so getting
  // stronger always counts, wherever it happened.
  //
  // Returns the total XP plus a per-date breakdown (`entries`) and a
  // per-session strength breakdown (`sessionEntries`) — that's what lets the
  // summary screen say exactly where a session's XP came from.
  function computeXpLedger(finishedSets, finishedSessions, plan, data, todayStr) {
    const today = todayStr || Rana.plan.todayStr();

    const setsBySession = new Map();
    for (const set of finishedSets) {
      const list = setsBySession.get(set.session_id) || [];
      list.push(set);
      setsBySession.set(set.session_id, list);
    }

    const sessionsByDate = new Map();
    for (const session of finishedSessions) {
      const list = sessionsByDate.get(session.date) || [];
      list.push(session);
      sessionsByDate.set(session.date, list);
    }
    sessionsByDate.forEach((list) => list.sort((a, b) => a.started_at.localeCompare(b.started_at)));

    const ledger = {
      totalXp: 0,
      entries: new Map(), // date → breakdown for that day
      sessionEntries: new Map(), // session_id → { increases, strengthXp }
      currentStreak: 0,
      longestStreak: 0,
      sessionsCompleted: 0, // sessions that earned session XP (planned or not)
      plannedSessionsCompleted: 0, // suggested workouts done as prescribed (INT)
      strengthIncreaseCount: 0,
    };

    // Per-exercise records: how many sessions logged, and the best score.
    const records = new Map();

    // Start at the plan's start date, or earlier if somehow there are
    // sessions from before it — never silently drop real work.
    const sessionDates = [...sessionsByDate.keys()].sort();
    const planStart = plan.start_date || today;
    let startStr = planStart;
    if (sessionDates.length && sessionDates[0] < startStr) startStr = sessionDates[0];

    const cursor = new Date(startStr + "T00:00:00");
    for (let dateStr = startStr; dateStr <= today; ) {
      const daySessions = sessionsByDate.get(dateStr) || [];
      const entry = {
        date: dateStr,
        isTrainingDay: false,
        restDay: false,
        completed: false, // the suggested workout was done as prescribed
        offPlan: false, // trained something else; streak held
        missed: false,
        streak: 0,
        xpSessionId: null, // which session earned today's session XP
        sessionXp: 0,
        streakBonusXp: 0,
        streakMultiplier: 1,
        increases: [],
        strengthXp: 0,
        totalXp: 0,
      };

      // --- Consistency ---
      const scheduled = Rana.plan.getSessionForDate(dateStr, plan, data, daySessions);
      if (scheduled.isRestDay) {
        entry.restDay = true; // workouts here still earn strength XP, below
      } else {
        entry.isTrainingDay = true;

        // The suggested workout counts as done once at least half its
        // prescribed sets are logged. Extra sets beyond the prescription
        // don't push it over the line.
        const prescribed = scheduled.slots.reduce((sum, s) => sum + s.working_sets, 0);
        let plannedDone = null;
        for (const s of daySessions.filter((x) => x.type === "planned")) {
          const sets = setsBySession.get(s.session_id) || [];
          const credited = scheduled.slots.reduce((sum, slot) => {
            const logged = sets.filter((x) => x.slot_id === slot.slot_id).length;
            return sum + Math.min(logged, slot.working_sets);
          }, 0);
          if (prescribed > 0 && credited / prescribed >= XP_RULES.COMPLETION_THRESHOLD) {
            plannedDone = s;
            break;
          }
        }
        // Any other session with enough sets counts as "trained, off-plan".
        const offPlanSession = daySessions.find(
          (s) => (setsBySession.get(s.session_id) || []).length >= XP_RULES.FREESTYLE_MIN_SETS
        );

        if (plannedDone) {
          entry.completed = true;
          entry.xpSessionId = plannedDone.session_id;
          ledger.currentStreak += 1;
          ledger.longestStreak = Math.max(ledger.longestStreak, ledger.currentStreak);
          ledger.sessionsCompleted += 1;
          ledger.plannedSessionsCompleted += 1;

          const boostedSessions = Math.min(ledger.currentStreak, XP_RULES.STREAK_MAX_SESSIONS);
          entry.streakMultiplier = 1 + boostedSessions * XP_RULES.STREAK_STEP;
          entry.sessionXp = XP_RULES.SESSION_XP;
          entry.streakBonusXp = Math.round(XP_RULES.SESSION_XP * (entry.streakMultiplier - 1));
        } else if (offPlanSession) {
          entry.offPlan = true;
          entry.xpSessionId = offPlanSession.session_id;
          ledger.sessionsCompleted += 1;
          entry.sessionXp = XP_RULES.SESSION_XP; // flat: no streak boost off-plan
        } else if (dateStr < today && dateStr >= planStart) {
          entry.missed = true;
          ledger.currentStreak = Math.floor(ledger.currentStreak / 2);
        }
      }
      entry.streak = ledger.currentStreak;

      // --- Strength increases: scored per session, in the order they happened ---
      for (const session of daySessions) {
        const sessionEntry = { increases: [], strengthXp: 0 };

        const setsByExercise = new Map();
        for (const set of setsBySession.get(session.session_id) || []) {
          const list = setsByExercise.get(set.exercise_key) || [];
          list.push(set);
          setsByExercise.set(set.exercise_key, list);
        }
        setsByExercise.forEach((sets, exerciseKey) => {
          const result = scoreExerciseDay(sets);
          if (!result) return;

          const recordKey = `${exerciseKey}:${result.mode}`;
          const record = records.get(recordKey) || { sessions: 0, best: 0 };

          const pastCalibration = record.sessions >= XP_RULES.CALIBRATION_SESSIONS;
          if (pastCalibration && record.best > 0 && result.score > record.best) {
            const percent = ((result.score - record.best) / record.best) * 100;
            const xp = Math.min(XP_RULES.MAX_XP_PER_EXERCISE, Math.round(percent * XP_RULES.XP_PER_PERCENT));
            if (xp > 0) {
              sessionEntry.increases.push({
                exerciseKey, mode: result.mode, percent, xp,
                bestSet: result.bestSet, sessionId: session.session_id,
              });
              sessionEntry.strengthXp += xp;
              ledger.strengthIncreaseCount += 1;
            }
          }

          record.best = Math.max(record.best, result.score);
          record.sessions += 1;
          records.set(recordKey, record);
        });

        ledger.sessionEntries.set(session.session_id, sessionEntry);
        entry.increases.push(...sessionEntry.increases);
        entry.strengthXp += sessionEntry.strengthXp;
      }

      entry.totalXp = entry.sessionXp + entry.streakBonusXp + entry.strengthXp;
      ledger.totalXp += entry.totalXp;
      ledger.entries.set(dateStr, entry);

      cursor.setDate(cursor.getDate() + 1);
      dateStr = Rana.plan.toDateStr(cursor);
    }

    return ledger;
  }

  // How much XP one session earned: its own strength increases, plus the
  // day's session XP and streak boost if this was the workout that earned
  // them. Summed over every session, this equals ledger.totalXp exactly
  // (scripts/test_leveling.js checks that).
  function xpForSession(ledger, session) {
    const sessionEntry = ledger.sessionEntries.get(session.session_id);
    const entry = ledger.entries.get(session.date);
    let xp = sessionEntry ? sessionEntry.strengthXp : 0;
    if (entry && entry.xpSessionId === session.session_id) xp += entry.sessionXp + entry.streakBonusXp;
    return xp;
  }

  // ---------------------------------------------------------------------
  // Earned titles: shown under your name. Placeholder names and
  // thresholds for the fitness expert to rename/tune. Ordered from easiest
  // to hardest — the last one earned is the one displayed.
  // ---------------------------------------------------------------------
  const TITLES = [
    { name: "The Unbroken", description: "Reached a 10-session streak", isEarned: (l) => l.longestStreak >= 10 },
    { name: "Limit Breaker", description: "10 strength increases", isEarned: (l) => l.strengthIncreaseCount >= 10 },
    { name: "Iron Will", description: "50 sessions completed", isEarned: (l) => l.sessionsCompleted >= 50 },
    { name: "Centurion", description: "100 sessions completed", isEarned: (l) => l.sessionsCompleted >= 100 },
  ];

  function earnedTitles(ledger) {
    return TITLES.filter((t) => t.isEarned(ledger));
  }

  function currentTitle(ledger) {
    const earned = earnedTitles(ledger);
    return earned.length ? earned[earned.length - 1] : null;
  }

  // ---------------------------------------------------------------------
  // Stats (STR / AGI / VIT / INT)
  // ---------------------------------------------------------------------
  // Everyone starts at 0 — the app can't know how strong you are before
  // you've trained, so it doesn't guess. Stats are only earned from logged
  // work. They grow with the square root of points, so early gains are
  // quick and visible and later ones take longer.
  function statValue(points) {
    return Math.floor(4 * Math.sqrt(points));
  }

  // Stat points earned from real logged sets (pass FINISHED sets only). INT
  // comes from suggested workouts done as prescribed — "following the plan" —
  // which the XP ledger counts, so pass ledger.plannedSessionsCompleted in.
  function computeStatPoints(loggedSets, exerciseByKey, plannedSessionsCompleted) {
    const points = { STR: 0, AGI: 0, VIT: 0, INT: 0 };

    for (const set of loggedSets) {
      const ex = exerciseByKey.get(set.exercise_key);
      if (!ex) continue;

      points.VIT += 1; // every completed set counts toward work capacity
      if (["Hip Hinge", "Hip Extension", "Trunk Flexion", "Anti-Extension"].includes(ex.movement_pattern)) {
        points.VIT += 0.5; // posterior-chain / core bonus
      }

      const topsOutAt8OrBelow = /^\s*(\d+)/.test(set.rep_range || "") &&
        Math.max(...(set.rep_range || "").split("-").map(Number)) <= 8;
      if (ex.is_compound && topsOutAt8OrBelow) points.STR += 1.5;

      if (ex.is_unilateral) points.AGI += 1;
      const repsNum = Number(set.reps) || 0;
      if (repsNum >= 12) points.AGI += 1;
    }

    points.INT = (plannedSessionsCompleted || 0) * XP_RULES.INT_POINTS_PER_SESSION;
    return points;
  }

  // ---------------------------------------------------------------------
  // 12-week route (the analysis screen's forecast)
  // ---------------------------------------------------------------------
  // Walks through the plan week by week, assuming every scheduled session
  // is completed, and reports:
  //   - the phase of each week (calibration → build, with the split's own
  //     deload weeks), and
  //   - which tiers get reached, and in which week.
  //
  // Honesty note: this counts CONSISTENCY XP ONLY (session XP + streak
  // boost), which is guaranteed if you show up. Strength-increase XP is
  // left out on purpose because the app can't know how fast you'll get
  // stronger — so the levels shown are a floor ("at least"), never an
  // inflated promise. The screen labels them that way.
  function forecastRoute(trainingDaysPerWeek, deloadEveryWeeks, weeks = 12) {
    const perWeek = Number(trainingDaysPerWeek) || 3;
    const deloadEvery = Number(deloadEveryWeeks) || 0;

    let xp = 0;
    let streak = 0;
    let lastTier = tierForLevel(1);
    const milestones = [{ week: 1, tier: lastTier, level: 1 }];
    const weekList = [];

    for (let w = 1; w <= weeks; w++) {
      for (let s = 0; s < perWeek; s++) {
        streak += 1;
        const boosted = Math.min(streak, XP_RULES.STREAK_MAX_SESSIONS);
        xp += Math.round(XP_RULES.SESSION_XP * (1 + boosted * XP_RULES.STREAK_STEP));
      }
      const level = levelForXp(xp);
      const tier = tierForLevel(level);
      if (tier !== lastTier) {
        milestones.push({ week: w, tier, level: TIERS.find((t) => t.name === tier).minLevel });
        lastTier = tier;
      }

      // Calibration = the first weeks, while each exercise is still being
      // logged for its first CALIBRATION_SESSIONS times (each workout day
      // repeats weekly, so that's the first 3 weeks). A deload week from
      // the split's own programming takes priority over everything else.
      let phase = "build";
      if (w <= XP_RULES.CALIBRATION_SESSIONS) phase = "calibration";
      if (deloadEvery && w % deloadEvery === 0) phase = "deload";

      weekList.push({ week: w, phase, xp, level, tier });
    }

    return {
      weeks: weekList,
      milestones,
      sessions: perWeek * weeks,
      finalLevel: weekList[weekList.length - 1].level,
      finalTier: weekList[weekList.length - 1].tier,
    };
  }

  // Projected stats after 12 weeks of following the assigned plan, starting
  // from 0. Estimates points from training_days_per_week × 12 weeks of
  // "average" sessions. A forecast conditional on showing up — the UI must
  // label it as one (PRD section 7.5), never as a guarantee.
  function computeProjectedStats(profile) {
    const sessionsOver12Weeks = Number(profile.training_days_per_week) * 12;
    // Every program workout is capped at 6 exercises x 3 sets (scripts/library_rules.py),
    // so a session is 18 working sets or just under: the real average is 17.9.
    const avgSetsPerSession = 18;

    const points = {
      STR: sessionsOver12Weeks * avgSetsPerSession * 0.35,
      AGI: sessionsOver12Weeks * avgSetsPerSession * 0.25,
      VIT: sessionsOver12Weeks * avgSetsPerSession * 1.0,
      INT: sessionsOver12Weeks * XP_RULES.INT_POINTS_PER_SESSION,
    };

    return {
      STR: statValue(points.STR),
      AGI: statValue(points.AGI),
      VIT: statValue(points.VIT),
      INT: statValue(points.INT),
    };
  }

  // --- Calorie / macro targets (display-only, PRD D4 + safety guardrails section 11) ---
  function computeCalorieTargets(profile) {
    const weightKg = Number(profile.weight_current) * 0.453592;
    const heightCm = Number(profile.height); // assumed already in cm; see questionnaire note
    const age = Number(profile.age);

    // Mifflin-St Jeor
    let bmr;
    if (profile.gender === "male") {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }

    const activityMultiplier = {
      "mostly-sitting": 1.35,
      "moderately-active": 1.55,
      "on-feet-all-day": 1.75,
    }[profile.activity_level] ?? 1.45;

    let target = bmr * activityMultiplier;

    if (profile.goal === "lose-fat") target -= 500;
    if (profile.goal === "build-muscle") target += 300;

    // Safety guardrail: rate cap. If current -> target weight implies losing
    // faster than ~1% bodyweight/week, we don't have a timeline UI yet to
    // extend, so the honest move for v1 is to soften the deficit itself
    // rather than imply an unsafe rate.
    if (profile.goal === "lose-fat" && profile.weight_target) {
      const weeklyCapLb = Number(profile.weight_current) * 0.01;
      const totalToLoseLb = Number(profile.weight_current) - Number(profile.weight_target);
      if (totalToLoseLb > 0) {
        const impliedWeeklyLossLb = 500 / 3500 * 7; // a 500 kcal/day deficit ≈ 1 lb/week
        if (impliedWeeklyLossLb > weeklyCapLb) {
          target = bmr * activityMultiplier - weeklyCapLb * 500; // scale deficit down to the cap
        }
      }
    }

    // Safety guardrail: calorie floor, never below regardless of the math above.
    const floor = profile.gender === "male" ? 1500 : 1200;
    target = Math.max(Math.round(target), floor);

    const proteinG = Math.round(Number(profile.weight_current) * 0.9); // ~0.9g/lb bodyweight
    const fatG = Math.round((target * 0.25) / 9);
    const remainingKcal = target - proteinG * 4 - fatG * 9;
    const carbsG = Math.max(Math.round(remainingKcal / 4), 0);

    return { calories: target, proteinG, carbsG, fatG, waterCups: 10 };
  }

  // --- Recovery: only ever computed from real data, `—` otherwise (PRD section 7.4) ---
  function computeRecovery(allLoggedSets, plan, sessionFeedbackByDate) {
    if (!allLoggedSets || allLoggedSets.length === 0) return null;

    const dates = [...new Set(allLoggedSets.map((s) => s.date))].sort();
    const lastDate = dates[dates.length - 1];
    const daysSinceLast = Math.round(
      (new Date() - new Date(lastDate + "T00:00:00")) / (1000 * 60 * 60 * 24)
    );

    const feedbackValues = Object.values(sessionFeedbackByDate || {});
    const avgDifficulty = feedbackValues.length
      ? feedbackValues.reduce((a, b) => a + b, 0) / feedbackValues.length
      : 3;

    // Simple 0-100 blend: more days rested nudges recovery up, recent hard
    // sessions nudge it down. First-pass formula, not from the PRD.
    let score = 70 + daysSinceLast * 8 - (avgDifficulty - 3) * 8;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  return {
    XP_RULES,
    TIERS,
    TITLES,
    xpForLevel,
    levelForXp,
    tierForLevel,
    estimatedOneRepMax,
    computeXpLedger,
    xpForSession,
    earnedTitles,
    currentTitle,
    statValue,
    computeStatPoints,
    computeProjectedStats,
    forecastRoute,
    computeCalorieTargets,
    computeRecovery,
  };
})();
