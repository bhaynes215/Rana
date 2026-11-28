// The game layer: XP, levels, tiers, earned titles, lift targets, and the
// calorie/macro display.
//
// The leveling rules below (XP sources, level curve, tiers, titles) were
// designed with the fitness expert on 2026-11-25 and are written up in full
// in docs/leveling-system.md. The specific numbers are placeholders to tune
// once real people use the app — they all live in XP_RULES so they're easy
// to find and change in one place.
//
// Design note: nothing about "current XP", "current level", a lift's best or
// a lift's target is ever stored. Every time the app needs them, it replays the full
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

    // Lift targets (redesign, 2026-11-28). Each main lift has a goal: its
    // estimated max plus a percentage, rounded UP to the next 5 lb (or a whole
    // rep for bodyweight lifts). Reaching it earns this one-time bonus, and a
    // new target appears. The % depends on the fitness level from the
    // questionnaire; starting guesses, the fitness expert's call.
    TARGET_HIT_XP: 500,
    TARGET_ROUND_LB: 5,
    // When calibration ends, an answer more than 20% above what was logged
    // (best < 80% of the answer) is replaced by the logged numbers, so a
    // too-high answer can't leave an unreachable target and a "negative" gain.
    TARGET_REBASE_BELOW: 0.8,
    TARGET_PERCENT: {
      "never-trained": 0.25,
      "returning": 0.15,
      "consistently": 0.08,
      default: 0.15, // no questionnaire answer available
    },
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
  // Lift records and targets
  // ---------------------------------------------------------------------
  // One record per exercise and mode, built while the ledger replays the
  // history (never stored):
  //   sessions   finished sessions that scored this exercise
  //   best       all-time best score (estimated max in lb, or reps)
  //   history    each session's best score: [{ date, session_id, score }]
  //   start      where the lift started: the questionnaire answer, else the
  //              best after calibration (null until one of those exists)
  //   target     { value, set_on, source: "answer" | "calibration" | "hit" } or null
  //   hits       targets reached: [{ date, session_id, value }]
  function newLiftRecord(exerciseKey, mode) {
    return {
      exerciseKey, mode, unit: mode === "bodyweight" ? "reps" : "lb",
      sessions: 0, best: 0, history: [], start: null, target: null, hits: [],
    };
  }

  function targetPercent(profile) {
    const table = XP_RULES.TARGET_PERCENT;
    return (profile && table[profile.fitness_level]) ?? table.default;
  }

  // The next target for a lift whose current score is `value`: the score plus
  // the level's percentage, rounded UP to the next 5 lb (weighted) or to a
  // whole rep, at least one more rep (bodyweight).
  function nextTarget(value, unit, profile) {
    const grown = value * (1 + targetPercent(profile));
    if (unit === "reps") return Math.max(Math.ceil(grown - 1e-9), Math.ceil(value) + 1);
    return Math.ceil(grown / XP_RULES.TARGET_ROUND_LB - 1e-9) * XP_RULES.TARGET_ROUND_LB;
  }

  // The questionnaire's "recent set" answers give each lift its first target.
  // Answers never become a personal best (record.best stays 0), so a made-up
  // number can't block real strength XP. { weight, reps } with weight 0 is a
  // bodyweight lift; { skipped: true } or no answer seeds nothing.
  function seedStartingLifts(profile, tracked, records, lifts) {
    const answers = (profile && profile.starting_lifts) || {};
    const created = profile && profile.created_at ? String(profile.created_at).slice(0, 10) : null;
    for (const [exerciseKey, answer] of Object.entries(answers)) {
      if (!tracked.has(exerciseKey)) continue;
      const reps = Number(answer && answer.reps);
      const weight = Number(answer && answer.weight) || 0;
      if (!(reps >= 1)) continue;
      const mode = weight > 0 ? "weighted" : "bodyweight";
      const record = newLiftRecord(exerciseKey, mode);
      record.start = mode === "weighted" ? estimatedOneRepMax(weight, reps) : reps;
      record.target = { value: nextTarget(record.start, record.unit, profile), set_on: created, source: "answer" };
      records.set(`${exerciseKey}:${mode}`, record);
      lifts.set(exerciseKey, record);
    }
  }

  // Called after a session's score for a lift has been added to its record.
  function updateTarget(record, score, date, sessionId, profile, sessionEntry) {
    const calibration = XP_RULES.CALIBRATION_SESSIONS;
    if (record.sessions < calibration) return; // still calibrating: no bonus yet

    if (record.sessions === calibration) {
      // Calibration just ended: no target yet (answer skipped), the answer was
      // too low (the lift already beats its target) or far too high. Start
      // from the logged numbers.
      const tooHigh = record.start && record.best < record.start * XP_RULES.TARGET_REBASE_BELOW;
      if (!record.target || record.best >= record.target.value || tooHigh) {
        record.target = { value: nextTarget(record.best, record.unit, profile), set_on: date, source: "calibration" };
        record.start = record.best;
      }
      return;
    }

    if (record.target && score >= record.target.value) {
      const hit = {
        exerciseKey: record.exerciseKey, mode: record.mode, unit: record.unit,
        value: record.target.value, next: nextTarget(score, record.unit, profile),
        xp: XP_RULES.TARGET_HIT_XP, sessionId,
      };
      record.hits.push({ date, session_id: sessionId, value: hit.value });
      record.target = { value: hit.next, set_on: date, source: "hit" };
      sessionEntry.targetHits.push(hit);
      sessionEntry.targetXp += hit.xp;
    }
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
  // Lift targets (the third XP source): every MAIN lift has a target; the
  // first set that reaches it earns TARGET_HIT_XP once and a new target
  // appears. Rules, in order:
  //   - No bonus during a lift's first CALIBRATION_SESSIONS sessions.
  //   - When the last calibration session ends, a lift with no target (the
  //     questionnaire answer was skipped), whose logged best already beats
  //     the target (the answer was too low) or is under 80% of the answer
  //     (too high), gets its target from the logged numbers instead.
  //   - Afterwards, a session whose best reaches the target earns the bonus;
  //     the next target is that session's best plus the same percentage.
  // The questionnaire's answers only set the first target. They are never a
  // personal best for the strength-increase XP above.
  //
  // Returns the total XP plus a per-date breakdown (`entries`), a per-session
  // breakdown (`sessionEntries`: strength increases and target hits, which is
  // what lets the summary screen say exactly where a session's XP came from),
  // and `lifts`: for every exercise, its calibration count, best, history,
  // start, target and hits (the Progress screen reads this).
  //
  // Takes one options object:
  //   sets, sessions   FINISHED sets and sessions
  //   plan, data       the active plan and the exercise library
  //   profile          optional; supplies fitness_level and starting_lifts
  //   today            optional "YYYY-MM-DD" (tests pass it)
  function computeXpLedger({ sets: finishedSets, sessions: finishedSessions, plan, data, profile = null, today: todayStr }) {
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
      sessionEntries: new Map(), // session_id → { increases, strengthXp, targetHits, targetXp }
      lifts: new Map(), // exercise_key → its record (latest mode), see newLiftRecord
      currentStreak: 0,
      longestStreak: 0,
      sessionsCompleted: 0, // sessions that earned session XP (planned or not)
      strengthIncreaseCount: 0,
    };

    // Per-exercise records, one per exercise AND mode (weighted or bodyweight),
    // so adding a dip belt starts a fresh baseline. `ledger.lifts` points at
    // each exercise's most recent record.
    const records = new Map();
    // Only main lifts (see Rana.plan.targetLiftKeys) have targets and bonuses.
    const tracked = Rana.plan.targetLiftKeys(data);
    seedStartingLifts(profile, tracked, records, ledger.lifts);

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
        targetHits: [],
        targetXp: 0,
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
        // A day in the user's OWN plan has no prescription (they build the
        // workout while logging), so it counts as following the plan once a
        // planned session that day has at least FREESTYLE_MIN_SETS sets.
        if (scheduled.isOwnWorkout) {
          plannedDone =
            daySessions.find(
              (x) => x.type === "planned" && (setsBySession.get(x.session_id) || []).length >= XP_RULES.FREESTYLE_MIN_SETS
            ) || null;
        }
        for (const s of scheduled.isOwnWorkout ? [] : daySessions.filter((x) => x.type === "planned")) {
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
        const sessionEntry = { increases: [], strengthXp: 0, targetHits: [], targetXp: 0 };

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
          const record = records.get(recordKey) || newLiftRecord(exerciseKey, result.mode);

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
          record.history.push({ date: dateStr, session_id: session.session_id, score: result.score });
          records.set(recordKey, record);
          ledger.lifts.set(exerciseKey, record);
          if (tracked.has(exerciseKey)) updateTarget(record, result.score, dateStr, session.session_id, profile, sessionEntry);
        });

        ledger.sessionEntries.set(session.session_id, sessionEntry);
        entry.increases.push(...sessionEntry.increases);
        entry.strengthXp += sessionEntry.strengthXp;
        entry.targetHits.push(...sessionEntry.targetHits);
        entry.targetXp += sessionEntry.targetXp;
      }

      entry.totalXp = entry.sessionXp + entry.streakBonusXp + entry.strengthXp + entry.targetXp;
      ledger.totalXp += entry.totalXp;
      ledger.entries.set(dateStr, entry);

      cursor.setDate(cursor.getDate() + 1);
      dateStr = Rana.plan.toDateStr(cursor);
    }

    return ledger;
  }

  // How much XP one session earned: its own strength increases and target
  // hits, plus the day's session XP and streak boost if this was the workout
  // that earned them. Summed over every session, this equals ledger.totalXp
  // exactly (scripts/test_leveling.js checks that).
  function xpForSession(ledger, session) {
    const sessionEntry = ledger.sessionEntries.get(session.session_id);
    const entry = ledger.entries.get(session.date);
    let xp = sessionEntry ? sessionEntry.strengthXp + sessionEntry.targetXp : 0;
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
    forecastRoute,
    computeCalorieTargets,
    nextTarget,
  };
})();
