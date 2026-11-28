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

  // A training day in the user's OWN plan is stored as this id instead of a
  // library workout id. The plan only says "Tuesday is Push"; there is no
  // exercise list behind it, so on that day the user builds the whole workout
  // from the exercise library while logging (the way a freestyle workout works).
  const OWN_WORKOUT = "OWN_WORKOUT";

  // --- Which schedule applied on a given date? ---
  // The plan is "the active schedule": weekday_map (and, for an own plan,
  // own_day_names). When the user switches plans, the old schedule is kept in
  // plan.schedule_history so past days are still judged against the plan that
  // was active THEN. Without this, switching plans would re-judge every past
  // day against the new week and change old XP and streaks after the fact.
  // A plan with no history (everyone before 2026-11-27) just uses weekday_map.
  function scheduleFor(plan, dateStr) {
    const history = plan.schedule_history;
    if (history && history.length) {
      let found = history[0]; // dates before the first entry use the first schedule
      for (const entry of history) {
        if (entry.effective_from <= dateStr) found = entry;
      }
      return { weekday_map: found.weekday_map, own_day_names: found.own_day_names || {} };
    }
    return { weekday_map: plan.weekday_map, own_day_names: plan.own_day_names || {} };
  }

  // When does a plan switch start? Today, unless a workout was already started
  // or finished today: then it starts tomorrow, so a workout already done
  // today is not re-judged against a different week.
  function switchEffectiveDate() {
    const today = todayStr();
    const trainedToday = Rana.storage.getSessions().some((s) => s.date === today);
    if (!trainedToday) return today;
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }

  // Writes a new schedule into the plan. A plan that is already active keeps
  // its old schedule in schedule_history (see scheduleFor); a draft (the
  // results screen, before lock-in) just changes, since nothing has happened yet.
  // Returns { plan, effectiveFrom }.
  function commitSchedule(oldPlan, nextPlan) {
    let effectiveFrom = null;
    if (oldPlan.status === "active") {
      const history =
        oldPlan.schedule_history && oldPlan.schedule_history.length
          ? [...oldPlan.schedule_history]
          : [{ effective_from: "0000-01-01", weekday_map: oldPlan.weekday_map, own_day_names: oldPlan.own_day_names || {} }];
      effectiveFrom = switchEffectiveDate();
      const entry = { effective_from: effectiveFrom, weekday_map: nextPlan.weekday_map, own_day_names: nextPlan.own_day_names || {} };
      const i = history.findIndex((h) => h.effective_from === effectiveFrom);
      if (i >= 0) history[i] = entry;
      else history.push(entry);
      history.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
      nextPlan.schedule_history = history;
    }
    Rana.storage.savePlan(nextPlan);
    return { plan: nextPlan, effectiveFrom };
  }

  // Makes one of the two saved plans ("rana" or "own") the active one.
  // plan.split_id always stays Rana's suggested split (even while the own plan
  // is active), so the screens that show Rana's plan keep working.
  function activatePlan(planId) {
    const plan = Rana.storage.getPlan();
    const def = Rana.storage.getSavedPlans()[planId];
    if (!plan || !def) return null;
    const next = {
      ...plan,
      active_plan_id: planId,
      weekday_map: { ...def.weekday_map },
      own_day_names: def.kind === "own" ? { ...def.own_day_names } : {},
    };
    if (planId === "rana") {
      next.split_id = def.split_id;
      next.training_weekdays = def.training_weekdays || plan.training_weekdays;
    }
    return commitSchedule(plan, next);
  }

  // Saves a new version of a saved plan. If it is the active one, the schedule
  // changes too (from today, through the history).
  function updateSavedPlan(def) {
    Rana.storage.saveSavedPlan(def);
    const plan = Rana.storage.getPlan();
    if (plan && (plan.active_plan_id || "rana") === def.plan_id) return activatePlan(def.plan_id);
    return { plan, effectiveFrom: null };
  }

  // A one-line summary for any weekday map: "4 days / week".
  function trainingDayCount(weekdayMap) {
    return Object.values(weekdayMap || {}).filter(Boolean).length;
  }

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
    const isRealId = (id) => id && id !== OWN_WORKOUT;

    // Every library workout id the plan has ever used: today's schedule plus
    // the history (own-plan days are not library ids, so they are skipped).
    const allMaps = [plan.weekday_map, ...(plan.schedule_history || []).map((h) => h.weekday_map)];
    const brokenIds = (map) => Object.values(map || {}).filter(isRealId).filter((id) => !data.workoutById.has(id));
    const ranaSplitMissing = !data.splitById.has(plan.split_id);
    if (!ranaSplitMissing && allMaps.every((m) => brokenIds(m).length === 0)) return false;

    const splitId = matchSplit(profile, data.splits);
    if (!splitId) return false;
    const weekdays = plan.training_weekdays || profile.training_weekdays || [];
    const newMap = buildWeekdayMap(data.workoutsBySplit.get(splitId) || [], weekdays);

    // Any day (today's or in the history) that points at a removed workout
    // gets the new split's workout for the same weekday. Own-plan days stay.
    const fixMap = (map) => {
      const out = { ...map };
      Object.keys(out).forEach((day) => {
        if (isRealId(out[day]) && !data.workoutById.has(out[day])) out[day] = newMap[day] || null;
      });
      return out;
    };
    const repaired = {
      ...plan,
      split_id: splitId,
      training_weekdays: weekdays,
      weekday_map: (plan.active_plan_id || "rana") === "rana" ? newMap : fixMap(plan.weekday_map),
      reassigned_at: new Date().toISOString(),
      reassigned_from: plan.split_id,
    };
    if (plan.schedule_history) {
      repaired.schedule_history = plan.schedule_history.map((h) => ({ ...h, weekday_map: fixMap(h.weekday_map) }));
    }
    Rana.storage.savePlan(repaired);

    // Keep the saved copy of Rana's plan in step.
    const saved = Rana.storage.getSavedPlans().rana;
    if (saved) Rana.storage.saveSavedPlan({ ...saved, split_id: splitId, training_weekdays: weekdays, weekday_map: newMap });

    console.warn(`Plan repaired: it pointed at a split or workout that no longer exists (Rana's split is now ${splitId}).`);
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
    const schedule = scheduleFor(plan, dateStr);
    const workoutId = schedule.weekday_map[weekday];

    if (!workoutId) {
      return { date: dateStr, weekday, isRestDay: true, status: "rest", finishedSessions: finished };
    }

    // A training day in the user's own plan: no library workout, no slots.
    // The stand-in "workout" only carries the name and a one-line description.
    const isOwnWorkout = workoutId === OWN_WORKOUT;
    const workout = isOwnWorkout
      ? {
          workout_id: OWN_WORKOUT,
          day_name: schedule.own_day_names[weekday] || "Your workout",
          session_focus: "You build this workout",
          est_session_minutes: null,
          is_own: true,
        }
      : data.workoutById.get(workoutId);
    const slots = isOwnWorkout ? [] : data.slotsByWorkout.get(workoutId) || [];
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
      isOwnWorkout,
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
    OWN_WORKOUT,
    scheduleFor,
    switchEffectiveDate,
    activatePlan,
    updateSavedPlan,
    trainingDayCount,
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
