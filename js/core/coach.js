// Rana, the coach: the progression rule behind his tips, and every line he
// says outside the questionnaire.
//
// The tips are specific on purpose (a weight, a rep count, an exercise name),
// never generic motivation. They come from one rule about what to do next
// with an exercise, worked out from the last time it was done:
//
//   Rana.coach.suggestion(key, slot, { data, sets, sessions })  -> { kind, weight, text }
//   Rana.coach.todayTip(ctx)                                    the Today screen's tip
//   Rana.coach.progressTip({ rows, today })                     the Progress screen's tip
//   Rana.coach.summaryLine({ ... })                             the workout summary's bubble
//   Rana.coach.streakLine({ streak, restDay })                  the line under Level on Today
//
// Pure functions: pass in finished sets and sessions, get text back.
// All the numbers are in COACH_RULES and all the wording in LINES, so the
// fitness expert can tune both without touching any logic.

window.Rana = window.Rana || {};

Rana.coach = (() => {
  // ---------------------------------------------------------------------
  // The progression rule's numbers (placeholders for the fitness expert)
  // ---------------------------------------------------------------------
  const COACH_RULES = {
    INCREMENT_LOWER_LB: 10, // Quads, Hamstrings and Glutes exercises
    INCREMENT_UPPER_LB: 5, // everything else (dumbbells: per dumbbell)
    BODYWEIGHT_ADD_LB: 5, // once every set hits the top of the range
    MISSED_SETS_TO_HOLD: 2, // sets below the bottom of the range that mean "hold"
    MISSES_TO_DROP: 2, // sessions in a row like that before dropping the weight
    DROP_PERCENT: 0.1, // the drop, rounded to 5 lb
    HARD_DIFFICULTY: 5, // a workout rated this hard (1-5) means "hold everything"
    MIN_RISE_LB: 5, // the smallest gain worth calling a lift "up" on Progress
    DEFAULT_REP_RANGE: [8, 12], // freestyle exercises have no prescribed range
  };

  // ---------------------------------------------------------------------
  // Rana's lines. {name}-style words are filled in by the code below.
  // Rules: first person, plain words, no emoji. Tips under about 90
  // characters, always naming a weight, reps or an exercise.
  // ---------------------------------------------------------------------
  const LINES = {
    signUp: "Last step. Use your school email so your progress is saved.",
    planReveal: "You're set, {name}. This is the plan I'd pick for {goal} on {days} days.",
    goalPhrase: {
      "build-muscle": "building muscle",
      "lose-fat": "losing fat",
      "get-stronger": "getting stronger",
      "general-fitness": "general fitness",
    },
    routeHeading: "Your first 12 weeks",
    routeFloor: "At least Level {level} by week 12 if you show up.",
    targetsHeading: "Daily targets",

    streak: "{n}-workout streak.",
    streakContinue: " Today keeps it going.",
    streakRest: "Rest day. Your streak is safe.",
    streakNone: "Today starts your streak.",
    restDay: "Rest today. Next up is {workout} on {weekday}.",
    restDayNoNext: "Rest today. Your next workout is coming up.",
    doneToday: "Nice work today. Next up is {workout} on {weekday}.",
    doneTodayNoNext: "Nice work today. Your next workout is coming up.",
    firstWorkout: "Your first {workout} is today. Go light and learn the moves.",
    freestyleEmpty: "Add your first exercise. I'll keep track of your sets.",

    tip: {
      add: "Add {inc} lb to your {exercise} today. You hit all {top} reps on every set last time.",
      addBodyweight: "You hit {top} reps on every set of {exercise}. Try adding {inc} lb today.",
      holdReps: "Stay at {weight} lb on {exercise} and go for one more rep per set.",
      holdMissed: "Keep {exercise} at {weight} lb today. A few sets came up short last time.",
      drop: "Drop {exercise} to {weight} lb and build back up. It's stalled two sessions in a row.",
      holdHard: "Last {workout} felt all-out. Keep the same weights today and own every rep.",
      firstTime: "First time on {exercise}? Find a weight you could lift for {top} reps with 2 left.",
      calibrating: "Still finding your {exercise} weight. Try {weight} lb and see how the reps feel.",
    },

    summary: {
      targetHit: "That's your {exercise} target: {value} {unit}. Next one is {next} {unit}.",
      levelUp: "Level {n}. Showing up is paying off.",
      newBest: "New best on {exercise}. That's what we're here for.",
      plain: "Logged. {sets} sets in {minutes} minutes.",
      restDay: "Good work. Today was a rest day, so it's strength XP only.",
    },

    progress: {
      fastest: "Your {exercise} is up {n} lb in {weeks} weeks. That's your fastest lift right now.",
      nearest: "{gap} {unit} to go on your {exercise} target.",
      empty: "Log a few workouts and I'll show you where you're getting stronger.",
    },

    loadError: "Something didn't load. Reload and I'll try again.",
    noHistory: "No workouts yet. Your first one shows up here.",
  };

  // Fills "{name}" style placeholders. A missing value becomes empty text.
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => (values[key] === undefined || values[key] === null ? "" : String(values[key])));
  }

  // 140 -> "140", 102.5 -> "102.5"
  const trim = (n) => String(Number(Number(n).toFixed(1)));
  const roundTo5 = (n) => Math.round(n / 5) * 5;

  // "Push Day A (Chest Focus)" -> "Push Day A" (see Rana.plan.dayTitle).
  const shortWorkoutName = (name) => Rana.plan.dayTitle(name) || "workout";

  // ---------------------------------------------------------------------
  // The progression rule
  // ---------------------------------------------------------------------
  // What to do with one exercise, from how it went the last time(s):
  //
  //   never done                          first-time    find a weight
  //   fewer than 3 sessions               calibrating   try last time's weight
  //   last workout was rated all-out      hold-hard     same weight
  //   every set hit the top of the range  add           last weight + an increment
  //   2+ sets under the range, twice      drop          10% lighter
  //   2+ sets under the range             hold-missed   same weight
  //   otherwise                           hold-reps     same weight, one more rep
  //
  // `slot` is the prescribed slot (rep range, number of sets), or null for a
  // freestyle exercise. `sets` and `sessions` are the FINISHED ones;
  // `excludeSessionId` leaves out the workout in progress.
  // Returns { kind, weight, text }: `weight` is what to pre-fill in the set
  // table (null when there is nothing to suggest).
  const LOWER_BODY = ["Quads", "Hamstrings", "Glutes"];

  function repRange(slot) {
    if (!slot || !slot.rep_range) return COACH_RULES.DEFAULT_REP_RANGE;
    const parts = String(slot.rep_range).split("-").map(Number);
    return [parts[0], parts[parts.length - 1]];
  }

  function suggestion(exerciseKey, slot, { data, sets, sessions, excludeSessionId = null }) {
    const exercise = data.exerciseByKey.get(exerciseKey);
    const [low, top] = repRange(slot);
    const values = { exercise: exercise ? exercise.exercise_name : exerciseKey, top, low };
    const history = Rana.progress.exerciseHistory(exerciseKey, { sets, sessions }, excludeSessionId);

    if (!history.length) return { kind: "first-time", weight: null, text: fill(LINES.tip.firstTime, values) };

    const last = history[0];
    const lastWeight = Math.max(...last.sets.map((s) => Number(s.weight) || 0));
    values.weight = trim(lastWeight);

    if (history.length < Rana.game.XP_RULES.CALIBRATION_SESSIONS) {
      return { kind: "calibrating", weight: lastWeight, text: fill(LINES.tip.calibrating, values) };
    }

    if ((Number(last.session.difficulty) || 0) >= COACH_RULES.HARD_DIFFICULTY) {
      values.workout = shortWorkoutName(Rana.plan.sessionTitle(last.session, data));
      return { kind: "hold-hard", weight: lastWeight, text: fill(LINES.tip.holdHard, values) };
    }

    const prescribedSets = slot ? slot.working_sets : 1;
    if (last.sets.length >= prescribedSets && last.sets.every((s) => Number(s.reps) >= top)) {
      const bodyweight = exercise && exercise.equipment === "Bodyweight" && lastWeight === 0;
      const lower = exercise && LOWER_BODY.includes(exercise.muscle_group);
      values.inc = bodyweight ? COACH_RULES.BODYWEIGHT_ADD_LB : lower ? COACH_RULES.INCREMENT_LOWER_LB : COACH_RULES.INCREMENT_UPPER_LB;
      return {
        kind: "add",
        weight: lastWeight + values.inc,
        text: fill(bodyweight ? LINES.tip.addBodyweight : LINES.tip.add, values),
      };
    }

    const missedSets = (h) => h.sets.filter((s) => Number(s.reps) < low).length;
    if (missedSets(last) >= COACH_RULES.MISSED_SETS_TO_HOLD) {
      let inARow = 0;
      for (const h of history) {
        if (missedSets(h) < COACH_RULES.MISSED_SETS_TO_HOLD) break;
        inARow += 1;
      }
      if (inARow >= COACH_RULES.MISSES_TO_DROP && lastWeight > 0) {
        const dropped = roundTo5(lastWeight * (1 - COACH_RULES.DROP_PERCENT));
        const weight = Math.max(0, dropped >= lastWeight ? lastWeight - 5 : dropped);
        values.weight = trim(weight);
        return { kind: "drop", weight, text: fill(LINES.tip.drop, values) };
      }
      return { kind: "hold-missed", weight: lastWeight, text: fill(LINES.tip.holdMissed, values) };
    }

    return { kind: "hold-reps", weight: lastWeight, text: fill(LINES.tip.holdReps, values) };
  }

  // ---------------------------------------------------------------------
  // Screen-level lines
  // ---------------------------------------------------------------------
  const ACTIONABLE = ["add", "drop", "hold-missed", "hold-hard"];
  const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
  const weekdayName = (dateStr) => new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });

  // The tip on Today. ctx is Rana.page's context: { data, profile, plan, today, sessions, sets }.
  //   already trained today        -> thanks, and what's next
  //   a rest day                   -> what's next
  //   your very first workout      -> go light and learn the moves
  //   an own-plan day              -> add your first exercise
  //   otherwise                    -> the first exercise today that needs a decision
  //                                   (add weight, drop, hold), else the first exercise's tip
  function todayTip(ctx) {
    const { data, plan, today, sessions, sets } = ctx;
    const finishedToday = sessions.filter((s) => s.date === today);
    const scheduled = Rana.plan.getSessionForDate(today, plan, data, finishedToday);

    // The next training day in the plan, within a week: { workout, weekday } or null.
    const nextWorkout = () => {
      for (let n = 1; n <= 7; n++) {
        const date = Rana.progress.addDays(today, n);
        const next = Rana.plan.getSessionForDate(date, plan, data, []);
        if (!next.isRestDay) return { workout: shortWorkoutName(next.workout ? next.workout.day_name : "your workout"), weekday: weekdayName(date) };
      }
      return null;
    };

    if (scheduled.status === "completed" || (scheduled.isRestDay && finishedToday.length)) {
      const next = nextWorkout();
      return { kind: "done", text: next ? fill(LINES.doneToday, next) : LINES.doneTodayNoNext };
    }
    if (scheduled.isRestDay) {
      const next = nextWorkout();
      return { kind: "rest", text: next ? fill(LINES.restDay, next) : LINES.restDayNoNext };
    }
    if (scheduled.isOwnWorkout) return { kind: "freestyle-empty", text: LINES.freestyleEmpty };
    if (!sessions.length) {
      return { kind: "first-workout", text: fill(LINES.firstWorkout, { workout: shortWorkoutName(scheduled.workout && scheduled.workout.day_name) }) };
    }

    const picks = Rana.plan.suggestWorkout(scheduled.slots, data, Rana.plan.activeLimitations(ctx.profile));
    const tips = scheduled.slots.map((slot, i) => suggestion(picks[i].exerciseKey, slot, { data, sets, sessions }));
    return tips.find((tip) => ACTIONABLE.includes(tip.kind)) || tips[0];
  }

  // The tip on Progress. `rows` come from Rana.progress.liftRows().
  //   the lift that gained the most over the last 5 weeks, if it gained at least MIN_RISE_LB
  //   else how far the nearest target is
  //   else an invitation to log workouts
  function progressTip({ rows, today }) {
    const cutoff = Rana.progress.addDays(today, -35);
    let best = null;
    for (const row of rows) {
      if (row.unit !== "lb" || row.state !== "tracking" || row.history.length < 2) continue;
      const older = row.history.filter((h) => h.date <= cutoff);
      const baseline = older.length ? older[older.length - 1] : row.history[0];
      // What was actually logged: while a lift is calibrating, `current` can be the questionnaire's answer.
      const logged = Math.round(Math.max(...row.history.map((h) => h.score)));
      const rise = logged - Math.round(baseline.score);
      if (rise >= COACH_RULES.MIN_RISE_LB && (!best || rise > best.rise)) {
        best = { row, rise, weeks: Math.max(1, Math.round(daysBetween(baseline.date, today) / 7)) };
      }
    }
    if (best) return { kind: "fastest", text: fill(LINES.progress.fastest, { exercise: best.row.name, n: best.rise, weeks: best.weeks }) };

    const near = rows
      .filter((row) => row.state === "tracking" && row.target > row.current)
      .sort((a, b) => a.target - a.current - (b.target - b.current))[0];
    if (near) return { kind: "nearest", text: fill(LINES.progress.nearest, { gap: near.target - near.current, unit: near.unit, exercise: near.name }) };

    return { kind: "empty", text: LINES.progress.empty };
  }

  // The bubble on the workout summary. Most notable thing first:
  // a target hit, then a new level, then a new best, then a plain finish.
  //   targetHits   [{ exerciseKey, value, next, unit }]
  //   increases    [{ exerciseKey, percent }]   (strength increases this session)
  function summaryLine({ data, targetHits = [], levelBefore, levelAfter, increases = [], sets = 0, minutes = 0, restDay = false }) {
    const nameOf = (key) => (data.exerciseByKey.get(key) || {}).exercise_name || key;
    if (targetHits.length) {
      const hit = targetHits[0];
      return { kind: "target", pose: "cheer", text: fill(LINES.summary.targetHit, { exercise: nameOf(hit.exerciseKey), value: hit.value, next: hit.next, unit: hit.unit || "lb" }) };
    }
    if (levelAfter > levelBefore) return { kind: "level-up", pose: "cheer", text: fill(LINES.summary.levelUp, { n: levelAfter }) };
    if (increases.length) {
      const top = [...increases].sort((a, b) => b.percent - a.percent)[0];
      return { kind: "new-best", pose: "cheer", text: fill(LINES.summary.newBest, { exercise: nameOf(top.exerciseKey) }) };
    }
    if (restDay) return { kind: "rest-day", pose: "wave", text: LINES.summary.restDay };
    return { kind: "plain", pose: "wave", text: fill(LINES.summary.plain, { sets, minutes }) };
  }

  // The line under "Level 7" on Today: { lead, text }. `lead` is the bold part.
  function streakLine({ streak, restDay }) {
    if (restDay) return { lead: "", text: LINES.streakRest };
    if (!streak) return { lead: "", text: LINES.streakNone };
    return { lead: fill(LINES.streak, { n: streak }), text: LINES.streakContinue };
  }

  // "You're set, Brennan. This is the plan I'd pick for getting stronger on 4 days."
  function planRevealLine({ name, goal, days }) {
    return fill(LINES.planReveal, { name, goal: LINES.goalPhrase[goal] || "your goals", days });
  }

  return { COACH_RULES, LINES, fill, shortWorkoutName, suggestion, todayTip, progressTip, summaryLine, streakLine, planRevealLine };
})();
