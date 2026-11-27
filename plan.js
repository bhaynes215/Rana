// Plan matching + the fixed weekly schedule.
//
// v1 plan generation is a lookup, not AI (PRD section 8). Since 2026-11-26
// it is a plain table written by the fitness expert: the GOAL picks the
// kind of program first, then the number of TRAINING DAYS picks the split
// (SPLIT_FOR below). Fitness level does not change the split; it only marks
// which day counts are "Recommended" on the questionnaire (RECOMMENDED_DAYS).
// Equipment is not an input (PRD D1): every exercise has swap options instead.
//
// A split lists its days in order, and someone training N days a week gets
// the first N. That is how one split serves several day counts, e.g. Upper/
// Lower: 3 days = Upper A, Lower A, Upper B; 4 adds Lower B; 5 adds Upper C;
// 6 adds Lower C. And 3-day PPL = Push A, Pull A, Legs A.
//
// Fixed weekly schedule: PRD/CLAUDE.md are explicit that a missed day is
// never silently rescheduled — Monday is always push, every week, forever.
// So instead of storing which workout happens on which date, we store which
// workout happens on which WEEKDAY (Mon/Tue/etc). The split's ordered
// workout days are assigned to the user's chosen training weekdays in order
// once, at plan-assignment time, and that mapping never changes.

window.Rana = window.Rana || {};

Rana.plan = (() => {
  // goal -> { days per week -> split_id }. "Lose fat" trains the same way as
  // "build muscle" (keep the muscle while in a calorie deficit); the deficit
  // itself comes from the calorie target on the results screen.
  const BUILD_MUSCLE = { 3: "SPLIT_PPL", 4: "SPLIT_AESTHETIC", 5: "SPLIT_HYBRID", 6: "SPLIT_PPL_ARNOLD" };
  const SPLIT_FOR = {
    "build-muscle": BUILD_MUSCLE,
    "lose-fat": BUILD_MUSCLE,
    "get-stronger": { 3: "SPLIT_UL", 4: "SPLIT_UL", 5: "SPLIT_UL", 6: "SPLIT_UL" },
    "general-fitness": { 3: "SPLIT_FB", 4: "SPLIT_UL", 5: "SPLIT_UL", 6: "SPLIT_UL" },
  };

  // Which day counts get a "Recommended" tag on the days question. A
  // suggestion only: every option stays pickable.
  const RECOMMENDED_DAYS = {
    "never-trained": [3, 4],
    "returning": [3, 4],
    "consistently": [4, 5],
  };

  const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // The split for this profile, from the table above. Returns the split_id
  // (not the full split object) — callers fetch details from Rana.data when
  // they need them. Returns null if the table names a split that isn't in
  // the data (e.g. someone renamed it in the workbook), so callers can say so.
  function matchSplit(profile, splits) {
    const byDays = SPLIT_FOR[profile.goal] || SPLIT_FOR["general-fitness"];
    const splitId = byDays[Number(profile.training_days_per_week)] || byDays[3];
    return splits.some((s) => s.split_id === splitId) ? splitId : null;
  }

  // A saved plan can point at a split or workout day that no longer exists,
  // because the program is still being designed (e.g. Anterior/Posterior was
  // removed on 2026-11-26). Rather than break every screen, re-pick the split
  // from the saved questionnaire answers, keeping the same weekdays, start
  // date and status. Called by data.js every time the data loads. Returns
  // true if the plan was changed.
  function repairPlan(data) {
    const plan = Rana.storage.getPlan();
    const profile = Rana.storage.getProfile();
    if (!plan || !profile) return false;
    const mappedIds = Object.values(plan.weekday_map || {}).filter(Boolean);
    const intact = data.splitById.has(plan.split_id) && mappedIds.every((id) => data.workoutById.has(id));
    if (intact) return false;

    const splitId = matchSplit(profile, data.splits);
    if (!splitId) return false;
    const weekdays = plan.training_weekdays || profile.training_weekdays || [];
    Rana.storage.savePlan({
      ...plan,
      split_id: splitId,
      training_weekdays: weekdays,
      weekday_map: buildWeekdayMap(data.workoutsBySplit.get(splitId) || [], weekdays),
      reassigned_at: new Date().toISOString(),
      reassigned_from: plan.split_id,
    });
    console.warn(`Plan reassigned: ${plan.split_id} no longer exists, now ${splitId}.`);
    return true;
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

  // --- Abs: an optional section at the end of every suggested workout ---
  // No program day assigns core work; instead every suggested workout ends
  // with the core exercises to choose from (decision 2026-11-26). Exercises
  // the workout already uses (as a main exercise or a swap option) are left
  // out, so the same exercise never appears twice in one workout.
  const ABS_HINT = "2–3 sets of 10–15 reps";

  function absOptions(data, slots) {
    const inWorkout = new Set(
      slots.flatMap((s) => (data.optionsBySlot.get(s.slot_id) || []).map((o) => o.exercise_key))
    );
    return data.exercises.filter((e) => e.muscle_group === "Core" && !inWorkout.has(e.exercise_key));
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
    SPLIT_FOR,
    RECOMMENDED_DAYS,
    WEEKDAY_ORDER,
    matchSplit,
    repairPlan,
    ABS_HINT,
    absOptions,
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
