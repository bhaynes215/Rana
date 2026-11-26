// Plan matching + the fixed weekly schedule.
//
// v1 plan generation is a lookup, not AI (PRD section 8): goal, fitness
// level and training days pick the best-fitting split out of the ones
// already authored in data/splits.json. Equipment is not an input (PRD D1).
//
// A note on "goal -> 4 templates": the PRD's decision log describes the
// target model as 4 goal templates, but the actual workbook has 7 real
// splits that already vary by days/week and experience level too (e.g. a
// 3-day beginner full-body split and a 6-day advanced PPL split are both
// "Hypertrophy"-flavored but very different programs). Picking the best of
// the 7 real splits by goal + days + experience serves the user better than
// forcing a 4-way choice the authored content doesn't actually have, and it
// doesn't reintroduce equipment as an axis — just uses the days/experience
// axes that were already there. Worth flagging to the fitness expert.
//
// Fixed weekly schedule: PRD/CLAUDE.md are explicit that a missed day is
// never silently rescheduled — Monday is always push, every week, forever.
// So instead of storing which workout happens on which date, we store which
// workout happens on which WEEKDAY (Mon/Tue/etc). The split's ordered
// workout days are assigned to the user's chosen training weekdays in order
// once, at plan-assignment time, and that mapping never changes.

window.Rana = window.Rana || {};

Rana.plan = (() => {
  const GOAL_TO_PRIMARY_GOAL = {
    "build-muscle": "Hypertrophy",
    "lose-fat": "Hypertrophy", // preserve muscle in a deficit — same structural need as hypertrophy
    "get-stronger": "Strength",
    "general-fitness": "General Fitness",
  };

  const FITNESS_LEVEL_TO_EXPERIENCE = {
    "never-trained": "Beginner",
    "returning": "Beginner",
    "consistently": "Intermediate",
    // Note: no split matches "Advanced" from a v1 questionnaire answer, since
    // none of the 3 fitness-level options self-report as advanced. The
    // Arnold split (Advanced-only) is in the library but currently
    // unreachable by the matcher — fine for v1, worth a future "advanced"
    // self-report option if that split should ever get used.
  };

  const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function scoreSplit(split, profile) {
    const wantGoal = GOAL_TO_PRIMARY_GOAL[profile.goal];
    const wantExperience = FITNESS_LEVEL_TO_EXPERIENCE[profile.fitness_level];
    const wantDays = Number(profile.training_days_per_week);

    let score = 0;
    score += split.primary_goal === wantGoal ? 1000 : 0;
    score -= Math.abs(split.days_per_week - wantDays) * 50;
    score += split.experience_level === wantExperience ? 10 : 0;
    return score;
  }

  // Picks the single best-fitting split for this profile. Returns the
  // split_id (not the full split object) — callers fetch details from
  // Rana.data when they need them, keeping this function free of a
  // dependency on data.js having already loaded.
  function matchSplit(profile, splits) {
    let best = null;
    let bestScore = -Infinity;
    for (const split of splits) {
      const score = scoreSplit(split, profile);
      if (score > bestScore) {
        bestScore = score;
        best = split;
      }
    }
    return best ? best.split_id : null;
  }

  // Assigns the split's workout days to the user's chosen training weekdays,
  // in order, once. E.g. split has [Push, Pull, Legs] and user trains
  // [Mon, Wed, Fri] -> Mon is always Push, Wed always Pull, Fri always Legs.
  function buildWeekdayMap(splitWorkouts, trainingWeekdays) {
    const sortedWeekdays = [...trainingWeekdays].sort(
      (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
    );
    const map = {};
    sortedWeekdays.forEach((day, i) => {
      map[day] = splitWorkouts[i] ? splitWorkouts[i].workout_id : null;
    });
    return map;
  }

  function weekdayAbbrev(date) {
    return WEEKDAY_ORDER[(date.getDay() + 6) % 7]; // JS getDay(): 0=Sun; rotate so 0=Mon
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  // Everything the dashboard/session-detail screens need to know about one
  // calendar date, given the plan and the workouts FINISHED on that date.
  //
  // The plan is a suggestion, not a rule (changed 2026-11-25): on any day the
  // user can also do a freestyle workout. So besides the suggested workout,
  // this reports what actually happened that day:
  //   status "completed" — the suggested workout was done (a finished
  //                        "planned" session exists)
  //   status "off-plan"  — a past training day where they trained something
  //                        else instead (freestyle only). Never shown as
  //                        "missed": they trained.
  //   status "today" / "upcoming" / "missed" / "not-started" — as before.
  // `finishedSessions` is always included, rest day or not, so a rest-day
  // workout is still visible to callers.
  function getSessionForDate(dateStr, plan, data, finishedSessionsForDate) {
    const finished = finishedSessionsForDate || [];
    const date = new Date(dateStr + "T00:00:00");
    const weekday = weekdayAbbrev(date);
    const workoutId = plan.weekday_map[weekday];

    if (!workoutId) {
      return { date: dateStr, weekday, isRestDay: true, status: "rest", finishedSessions: finished };
    }

    const workout = data.workoutById.get(workoutId);
    const slots = data.slotsByWorkout.get(workoutId) || [];
    const plannedDone = finished.some((s) => s.type === "planned");
    const trainedOffPlan = !plannedDone && finished.length > 0;

    let status;
    if (dateStr === todayStr()) {
      status = plannedDone ? "completed" : "today";
    } else if (dateStr < todayStr()) {
      // A training weekday before the plan's own start_date was never
      // actually scheduled — marking it "missed" would tell a brand-new
      // user they failed a workout that didn't exist yet. Caught this by
      // actually looking at a fresh dashboard: every weekday earlier in
      // the current calendar week showed up red on day one.
      if (plannedDone) status = "completed";
      else if (trainedOffPlan) status = "off-plan";
      else status = dateStr < plan.start_date ? "not-started" : "missed";
    } else {
      status = "upcoming";
    }

    return {
      date: dateStr,
      weekday,
      isRestDay: false,
      status,
      workoutId,
      workout,
      slots,
      finishedSessions: finished,
      trainedOffPlan,
    };
  }

  // --- Limitations: they shape the SUGGESTED workout only ---
  // The questionnaire asks about knee / shoulder / lower-back / wrist
  // limitations. They are used here, to pick which exercise a suggested
  // workout's slot starts on, and nowhere else: freestyle workouts, the exercise
  // picker and the swap buttons always offer everything.
  //
  // For each slot: use the highest-ranked option that doesn't load any of the
  // user's limited joints. If EVERY option conflicts, keep the main exercise
  // but return a caution so the screen can say "go light or skip."

  function activeLimitations(profile) {
    return ((profile && profile.limitations) || []).filter((l) => l && l !== "none");
  }

  function jointConflicts(exerciseKey, limitations, data) {
    const tags = data.limitationsByExercise.get(exerciseKey) || [];
    return tags.filter((joint) => limitations.includes(joint));
  }

  // Returns { exerciseKey, caution: [joints], substituted, replacedKey, replacedJoints }.
  //
  // A swapped-in exercise avoids anything already used by an earlier slot in
  // the same workout (`avoidKeys`), so a swap never makes the workout list the
  // same exercise twice. The slot's own main exercise is exempt: if it's
  // clean it's always used, exactly as the workout was written.
  function pickSuggestedOption(slot, data, limitations, avoidKeys) {
    const options = data.optionsBySlot.get(slot.slot_id) || []; // already sorted by rank
    if (options.length === 0) return { exerciseKey: null, caution: [], substituted: false };
    const avoid = avoidKeys || new Set();
    const clean = (o) => jointConflicts(o.exercise_key, limitations, data).length === 0;
    const swappedIn = (o) => ({
      exerciseKey: o.exercise_key,
      caution: [],
      substituted: true,
      replacedKey: options[0].exercise_key,
      replacedJoints: jointConflicts(options[0].exercise_key, limitations, data),
    });

    // 1. The main exercise, if it's fine.
    if (clean(options[0])) return { exerciseKey: options[0].exercise_key, caution: [], substituted: false };
    // 2. The best alternative that's fine AND not already in this workout.
    const fresh = options.slice(1).find((o) => clean(o) && !avoid.has(o.exercise_key));
    if (fresh) return swappedIn(fresh);
    // 3. Any alternative that's fine, even if it repeats.
    const repeat = options.slice(1).find(clean);
    if (repeat) return swappedIn(repeat);
    // 4. Everything conflicts: keep the main exercise, with a note.
    return {
      exerciseKey: options[0].exercise_key,
      caution: jointConflicts(options[0].exercise_key, limitations, data),
      substituted: false,
    };
  }

  // The suggested exercise for every slot of a workout, in order. A swap
  // avoids exercises used by earlier slots AND exercises that later slots use
  // as their main exercise (otherwise a swap in slot 1 could grab what slot 4
  // is about to use as written, and the workout would repeat it).
  function suggestWorkout(slots, data, limitations) {
    const mainKeys = slots
      .map((slot) => (data.optionsBySlot.get(slot.slot_id) || [])[0])
      .filter(Boolean)
      .map((o) => o.exercise_key);
    const used = new Set();
    return slots.map((slot) => {
      const pick = pickSuggestedOption(slot, data, limitations, new Set([...used, ...mainKeys]));
      if (pick.exerciseKey) used.add(pick.exerciseKey);
      return pick;
    });
  }

  // "Swapped from Conventional Deadlift to protect your lower back."
  function swapText(pick, data) {
    const from = data.exerciseByKey.get(pick.replacedKey);
    const joints = (pick.replacedJoints || []).map((j) => j.replace("-", " ")).join(" and ");
    return `Swapped from ${from ? from.exercise_name : "the usual choice"} to protect your ${joints}.`;
  }

  function cautionText(joints) {
    const names = joints.map((j) => j.replace("-", " "));
    return `Heads up: this exercise loads your ${names.join(" and ")}. Go light or skip it if it bothers you.`;
  }

  // The name to show for a session: freestyle sessions carry their own
  // title; planned ones use the workout's name (older records have no title).
  function sessionTitle(session, data) {
    if (session.title) return session.title;
    const workout = data.workoutById.get(session.workout_id);
    return workout ? workout.day_name : "Workout";
  }

  return {
    GOAL_TO_PRIMARY_GOAL,
    FITNESS_LEVEL_TO_EXPERIENCE,
    WEEKDAY_ORDER,
    matchSplit,
    buildWeekdayMap,
    weekdayAbbrev,
    toDateStr,
    todayStr,
    getSessionForDate,
    activeLimitations,
    pickSuggestedOption,
    suggestWorkout,
    swapText,
    cautionText,
    sessionTitle,
  };
})();
