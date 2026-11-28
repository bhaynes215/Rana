// Leveling + sessions check: runs the app's REAL storage.js, plan.js and
// game.js (no copies of the formulas) against fake workout histories, then
// prints PASS/FAIL for each rule plus a 3-year simulation. No dependencies
// beyond Node.
//
// Usage, from the project folder:
//   node scripts/test_leveling.js
//
// Run it after changing anything in XP_RULES, the level curve, the session
// rules or the limitation logic. Exits non-zero if any check fails, like
// validate_library.py.
//
// How it works: these files are written for the browser (they attach to
// `window.Rana` and storage.js uses `localStorage`), so this loads them into
// a sandbox with a fake `window` and a fake `localStorage` using Node's
// built-in `vm` module, and builds the same lookup maps data.js builds from
// data/*.json.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = process.argv[2] || path.join(__dirname, "..");

const store = new Map();
const ctx = {
  console, Math, Date, Map, Set, Number, String, Object, Array, JSON,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["storage.js", "plan.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx);
}
const { Rana } = ctx;

const j = (f) => JSON.parse(fs.readFileSync(path.join(dir, "data", f), "utf8"));
const exercises = j("exercises.json"), splits = j("splits.json"), workouts = j("workouts.json"), slotsDoc = j("slots.json");
const limitationsDoc = j("exercise_limitations.json");
const group = (arr, key) => { const m = new Map(); arr.forEach((x) => { const l = m.get(x[key]) || []; l.push(x); m.set(x[key], l); }); return m; };
const data = {
  slots: slotsDoc.slots,
  exerciseByKey: new Map(exercises.map((e) => [e.exercise_key, e])),
  workoutById: new Map(workouts.map((w) => [w.workout_id, w])),
  slotsByWorkout: group(slotsDoc.slots, "workout_id"),
  optionsBySlot: group(slotsDoc.slot_options, "slot_id"),
  limitationsByExercise: new Map(Object.entries(limitationsDoc.tags)),
};
data.slotsByWorkout.forEach((l) => l.sort((a, b) => a.slot_order - b.slot_order));
data.splits = splits;
data.splitById = new Map(splits.map((s) => [s.split_id, s]));
data.workoutsBySplit = new Map(splits.map((s) => [s.split_id, (s.workout_ids || []).map((id) => data.workoutById.get(id)).filter(Boolean)]));
data.optionsBySlot.forEach((l) => l.sort((a, b) => a.option_rank - b.option_rank));

function makePlan(splitId, weekdays, startDate) {
  const ws = workouts.filter((w) => w.split_id === splitId).sort((a, b) => a.day_order - b.day_order);
  return { split_id: splitId, start_date: startDate, status: "active", weekday_map: Rana.plan.buildWeekdayMap(ws, weekdays) };
}
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return Rana.plan.toDateStr(d); };
let failures = 0;
const check = (label, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`); if (!cond) failures++; };

// ---- Builders for fake finished sessions + their sets ----
let idCounter = 0;
function makeSession(date, type, workoutId = null, title = null) {
  idCounter += 1;
  return {
    session_id: `s_test_${idCounter}`, date, type, title, workout_id: workoutId,
    started_at: `${date}T1${idCounter % 10}:00:00.000Z`, finished_at: `${date}T1${idCounter % 10}:45:00.000Z`,
    exercises: [], difficulty: null,
  };
}
// A suggested workout done as prescribed. `overrides` lets a test change
// the weight/reps of one exercise (by key).
function plannedSession(plan, date, overrides = {}) {
  const sched = Rana.plan.getSessionForDate(date, plan, data, []);
  const session = makeSession(date, "planned", sched.workoutId);
  const sets = [];
  sched.slots.forEach((slot) => {
    const key = data.optionsBySlot.get(slot.slot_id)[0].exercise_key;
    const o = overrides[key] || {};
    for (let k = 0; k < slot.working_sets; k++) {
      sets.push({ session_id: session.session_id, date, slot_id: slot.slot_id, exercise_key: key, set_index: k + 1,
        weight: o.weight ?? 50, reps: o.reps ?? 10 });
    }
  });
  return { session, sets };
}
function freestyleSession(date, exerciseKey, nSets, weight = 60, reps = 10) {
  const session = makeSession(date, "freestyle", null, "Arm day");
  session.exercises = [exerciseKey];
  const sets = [];
  for (let k = 0; k < nSets; k++) sets.push({ session_id: session.session_id, date, slot_id: null, exercise_key: exerciseKey, set_index: k + 1, weight, reps });
  return { session, sets };
}
function ledgerOf(parts, plan, today) {
  const sessions = parts.map((p) => p.session);
  const sets = parts.flatMap((p) => p.sets);
  return Rana.game.computeXpLedger(sets, sessions, plan, data, today);
}

// ---------- 1. Simulation: 4 days/week for 3 years, always the suggested workout ----------
const four = splits.find((s) => s.days_per_week === 4);
const START = "2027-01-04"; // a Monday
const plan4 = makePlan(four.split_id, ["Mon", "Tue", "Thu", "Fri"], START);
const simParts = [];
const baseE1rm = new Map();
const END = addDays(START, 3 * 364 - 1);
for (let i = 0, d = START; d <= END; i++, d = addDays(START, i)) {
  const week = Math.floor(i / 7);
  const s = Rana.plan.getSessionForDate(d, plan4, data, []);
  if (s.isRestDay) continue;
  const deload = week % 6 === 5;
  const overrides = {};
  s.slots.forEach((slot) => {
    const key = data.optionsBySlot.get(slot.slot_id)[0].exercise_key;
    if (!baseE1rm.has(key)) baseE1rm.set(key, 100);
    // Strength curve: about +60% over the long run, most of it in year 1.
    const target = baseE1rm.get(key) * (1 + 0.6 * (1 - Math.exp(-week / 40))) * (deload ? 0.85 : 1);
    overrides[key] = { reps: 8, weight: Math.floor(target / (1 + 8 / 30) / 5) * 5 };
  });
  simParts.push(plannedSession(plan4, d, overrides));
}
const ledger = ledgerOf(simParts, plan4, END);
const level = Rana.game.levelForXp(ledger.totalXp);
const strengthXp = [...ledger.entries.values()].reduce((a, e) => a + e.strengthXp, 0);
console.log(`\nSimulated ${four.split_name} (4 days/wk), 3 years, no misses:`);
console.log(`  sessions ${ledger.sessionsCompleted}, total XP ${ledger.totalXp.toLocaleString()} (strength ${strengthXp.toLocaleString()}), level ${level}, tier ${Rana.game.tierForLevel(level)}`);
for (const [label, days] of [["1 year", 364], ["2 years", 728]]) {
  const cutoff = addDays(START, days);
  const parts = simParts.filter((p) => p.session.date < cutoff);
  const l = ledgerOf(parts, plan4, addDays(START, days - 1));
  const lv = Rana.game.levelForXp(l.totalXp);
  console.log(`  at ${label}: level ${lv} (${Rana.game.tierForLevel(lv)})`);
}
check("3 years at 4 days/week lands near Mythic (Level 49-53)", level >= 49 && level <= 53, `level ${level}`);
check("titles earned after 3 years", Rana.game.earnedTitles(ledger).length === 4, Rana.game.earnedTitles(ledger).map((t) => t.name).join(", "));

// ---------- 2. Consistency and strength rules on a small hand-built history ----------
const three = splits.find((s) => s.days_per_week === 3);
const S2 = "2027-01-04"; // Monday
const plan3 = makePlan(three.split_id, ["Mon", "Wed", "Fri"], S2);
const benchKey = data.optionsBySlot.get(Rana.plan.getSessionForDate(S2, plan3, data, []).slots[0].slot_id)[0].exercise_key;
const mondays = [0, 7, 14, 21].map((n) => addDays(S2, n));
const lowerOnly = { [benchKey]: { weight: 185, reps: 6 } };

// Weeks 1-3: all three sessions every week, bench 185x6 on Mondays.
let h = [];
for (let w = 0; w < 3; w++) {
  h.push(plannedSession(plan3, addDays(S2, w * 7), lowerOnly));
  h.push(plannedSession(plan3, addDays(S2, w * 7 + 2)));
  h.push(plannedSession(plan3, addDays(S2, w * 7 + 4)));
}
let L = ledgerOf(h, plan3, addDays(S2, 20));
check("no strength XP during the 3 calibration sessions", [...L.entries.values()].every((e) => e.strengthXp === 0));

const week4Mon = plannedSession(plan3, mondays[3], { [benchKey]: { weight: 185, reps: 7 } });
L = ledgerOf(h.concat([week4Mon]), plan3, mondays[3]);
const e4 = L.entries.get(mondays[3]);
const benchInc = e4.increases.find((i) => i.exerciseKey === benchKey);
check("185x6 -> 185x7 earns 28 XP (+2.8%)", benchInc && benchInc.xp === 28, benchInc ? `${benchInc.percent.toFixed(2)}% → ${benchInc.xp} XP` : "no increase found");
check("session XP is 100 + streak bonus", e4.sessionXp === 100 && e4.streakBonusXp === Math.round(100 * Math.min(e4.streak, 10) * 0.05), `streak ${e4.streak}, bonus ${e4.streakBonusXp}`);
check("the increase remembers which set was the best", benchInc && benchInc.bestSet.weight === 185 && benchInc.bestSet.reps === 7);

const capH = h.concat([plannedSession(plan3, mondays[3], { [benchKey]: { weight: 245, reps: 7 } })]);
const capE = ledgerOf(capH, plan3, mondays[3]).entries.get(mondays[3]);
check("a huge jump is capped at 60 XP", capE.increases.find((i) => i.exerciseKey === benchKey).xp === 60);

const highH = h.concat([plannedSession(plan3, mondays[3], { [benchKey]: { weight: 185, reps: 16 } })]);
const highE = ledgerOf(highH, plan3, mondays[3]).entries.get(mondays[3]);
check("sets of 16+ reps don't count toward strength XP", !highE.increases.find((i) => i.exerciseKey === benchKey));

// Missing halves the streak: nothing logged Mon-Fri of week 4.
const streakBefore = ledgerOf(h, plan3, addDays(S2, 20)).currentStreak;
const missL = ledgerOf(h, plan3, addDays(S2, 26)); // through Sunday of week 4
check("three misses halve the streak three times", missL.currentStreak === Math.floor(Math.floor(Math.floor(streakBefore / 2) / 2) / 2), `${streakBefore} → ${missL.currentStreak}`);
check("missed days earn 0 XP", missL.entries.get(mondays[3]).totalXp === 0 && missL.entries.get(mondays[3]).missed);

// A suggested workout cut short (under half the sets, under 3 sets) earns nothing.
const tiny = plannedSession(plan3, mondays[3]);
tiny.sets = tiny.sets.slice(0, 2);
const tinyE = ledgerOf(h.concat([tiny]), plan3, addDays(S2, 24)).entries.get(mondays[3]);
check("a workout under 3 sets (and under half) earns no session XP and counts as missed", tinyE.sessionXp === 0 && tinyE.missed);

// Today, nothing yet: not counted as missed.
const todayL = ledgerOf(h, plan3, mondays[3]);
check("today in progress isn't marked missed", !todayL.entries.get(mondays[3]).missed);

// Bodyweight: 8 -> 10 reps at 0 weight = +25%.
const bwSlot = Rana.plan.getSessionForDate(S2, plan3, data, []).slots[0];
const bwParts = [0, 7, 14, 21].map((n, i) => {
  const date = addDays(S2, n);
  const session = makeSession(date, "freestyle", null, "Pull-ups");
  const sets = [{ session_id: session.session_id, date, slot_id: null, exercise_key: "pull_up_test", set_index: 1, weight: 0, reps: i < 3 ? 8 : 10 }];
  return { session, sets };
});
const bwInc = ledgerOf(bwParts, plan3, addDays(S2, 21)).entries.get(addDays(S2, 21)).increases[0];
check("bodyweight 8 -> 10 reps = +25%, capped to 60 XP", bwInc && bwInc.mode === "bodyweight" && Math.round(bwInc.percent) === 25 && bwInc.xp === 60, bwInc ? `${bwInc.percent}% → ${bwInc.xp}` : "none");

// ---------- 3. The freestyle / rest-day rules (set 2026-11-25) ----------
console.log("");
const base = h.slice(0); // weeks 1-3 done in full (Mon/Wed/Fri) → streak 9
const streakAfter3Weeks = ledgerOf(base, plan3, addDays(S2, 20)).currentStreak;
const tuesday = addDays(S2, 22); // week 4 Tuesday: a rest day on this plan
const mondayW4 = mondays[3];

// Rest-day workout: NO session XP, streak untouched, strength XP still counts.
const restFree = freestyleSession(tuesday, benchKey, 4, 200, 8);
const restL = ledgerOf(base.concat([plannedSession(plan3, mondayW4), restFree]), plan3, tuesday);
const restE = restL.entries.get(tuesday);
check("rest-day workout earns NO session XP", restE.restDay && restE.sessionXp === 0 && restE.streakBonusXp === 0);
check("rest-day workout leaves the streak untouched", restE.streak === restL.entries.get(mondayW4).streak);
const restStrength = ledgerOf(base.concat([plannedSession(plan3, mondayW4, { [benchKey]: { weight: 150, reps: 6 } }), restFree]), plan3, tuesday).entries.get(tuesday);
check("rest-day workout still earns strength XP for a real gain", restStrength.strengthXp > 0, `${restStrength.strengthXp} XP`);

// Freestyle on a training day instead of the suggested workout: flat XP, streak HOLDS.
const free3 = freestyleSession(mondayW4, "db_curl", 3);
const freeL = ledgerOf(base.concat([free3]), plan3, addDays(S2, 24)); // through Wed of week 4 (Mon off-plan, Wed missed)
const freeE = freeL.entries.get(mondayW4);
check("freestyle (3 sets) on a training day earns flat session XP, no boost", freeE.offPlan && freeE.sessionXp === 100 && freeE.streakBonusXp === 0);
check("freestyle on a training day HOLDS the streak", freeE.streak === streakAfter3Weeks, `${freeE.streak} vs ${streakAfter3Weeks}`);
const free2 = freestyleSession(mondayW4, "db_curl", 2);
const free2E = ledgerOf(base.concat([free2]), plan3, addDays(S2, 24)).entries.get(mondayW4);
check("freestyle under 3 sets doesn't count (day is missed)", free2E.sessionXp === 0 && free2E.missed);

// Session XP at most once per day: suggested + freestyle the same day.
const both = ledgerOf(base.concat([plannedSession(plan3, mondayW4), freestyleSession(mondayW4, "db_curl", 5)]), plan3, mondayW4).entries.get(mondayW4);
check("session XP is earned at most once per day (suggested workout wins)", both.sessionXp === 100 && both.completed && !both.offPlan);

// ---------- 4. Sessions in storage: in-progress vs finished, discard, migration ----------
console.log("");
store.clear();
Rana.storage.savePlan(plan3);
const inProg = Rana.storage.startSession({ type: "freestyle", title: "Legs", date: mondayW4 });
Rana.storage.addLoggedSet({ session_id: inProg.session_id, date: mondayW4, exercise_key: "leg_press", set_index: 1, weight: 200, reps: 10 });
check("a started session is in progress", Rana.storage.getInProgressSession()?.session_id === inProg.session_id);
check("in-progress sets don't count (getFinishedSets)", Rana.storage.getFinishedSets().length === 0 && Rana.storage.getAllLoggedSets().length === 1);
Rana.storage.finishSession(inProg.session_id, 4);
check("finishing makes the sets count and records difficulty", Rana.storage.getFinishedSets().length === 1 && Rana.storage.getDifficultyByDate()[mondayW4] === 4);
const doomed = Rana.storage.startSession({ type: "freestyle", title: "Oops", date: mondayW4 });
Rana.storage.addLoggedSet({ session_id: doomed.session_id, date: mondayW4, exercise_key: "bench", set_index: 1, weight: 100, reps: 5 });
Rana.storage.discardSession(doomed.session_id);
check("discarding removes the session AND its sets", !Rana.storage.getSession(doomed.session_id) && Rana.storage.getAllLoggedSets().length === 1);

store.clear();
Rana.storage.savePlan(plan3);
store.set("rana:v1:logged_sets", JSON.stringify([
  { date: S2, slot_id: 1, exercise_key: "bench", set_index: 1, weight: 100, reps: 8, completed_at: `${S2}T10:00:00.000Z` },
  { date: S2, slot_id: 1, exercise_key: "bench", set_index: 2, weight: 100, reps: 8, completed_at: `${S2}T10:05:00.000Z` },
  { date: addDays(S2, 1), slot_id: null, exercise_key: "bench", set_index: 1, weight: 90, reps: 8, completed_at: `${addDays(S2, 1)}T10:00:00.000Z` },
]));
store.set("rana:v1:session_feedback", JSON.stringify({ [S2]: 3 }));
const migrated = Rana.storage.getFinishedSessions();
check("legacy sets (no session_id) migrate into finished sessions, one per date", migrated.length === 2 && Rana.storage.getAllLoggedSets().every((s) => s.session_id));
check("a legacy training-day workout becomes 'planned', a rest-day one 'freestyle'",
  migrated.find((s) => s.date === S2).type === "planned" && migrated.find((s) => s.date === addDays(S2, 1)).type === "freestyle");
check("legacy per-date difficulty moves onto the session", migrated.find((s) => s.date === S2).difficulty === 3);
Rana.storage.getAllLoggedSets();
check("migration is idempotent (running again adds nothing)", Rana.storage.getSessions().length === 2);

// Fixing mistakes: sets get ids, can be edited and deleted.
store.clear();
Rana.storage.savePlan(plan3);
const fixMe = Rana.storage.startSession({ type: "freestyle", title: "Typo test", date: mondayW4 });
const typo = Rana.storage.addLoggedSet({ session_id: fixMe.session_id, date: mondayW4, exercise_key: "bench", set_index: 1, weight: 1000, reps: 8 });
const other = Rana.storage.addLoggedSet({ session_id: fixMe.session_id, date: mondayW4, exercise_key: "bench", set_index: 2, weight: 100, reps: 8 });
check("every new set gets its own set_id", typo.set_id && other.set_id && typo.set_id !== other.set_id);
Rana.storage.updateLoggedSet(typo.set_id, { weight: 100 });
check("editing a set changes only that set", Rana.storage.getSetsForSession(fixMe.session_id).map((x) => x.weight).join() === "100,100");
Rana.storage.deleteLoggedSet(other.set_id);
check("deleting a set removes only that set", Rana.storage.getSetsForSession(fixMe.session_id).length === 1);
store.set("rana:v1:logged_sets", JSON.stringify([{ session_id: fixMe.session_id, date: mondayW4, exercise_key: "bench", set_index: 1, weight: 1, reps: 1 }]));
check("older sets without a set_id get one on read", Rana.storage.getAllLoggedSets().every((x) => x.set_id));

// The history's per-workout XP adds up to the lifetime total.
const histParts = base.concat([plannedSession(plan3, mondayW4, { [benchKey]: { weight: 200, reps: 8 } }), freestyleSession(tuesday, benchKey, 4, 210, 8), freestyleSession(mondayW4, "db_curl", 4)]);
const histLedger = ledgerOf(histParts, plan3, tuesday);
const perSession = histParts.reduce((sum, p) => sum + Rana.game.xpForSession(histLedger, p.session), 0);
check("per-workout XP (history) sums exactly to total XP", perSession === histLedger.totalXp, `${perSession} vs ${histLedger.totalXp}`);

// ---------- 5. Limitations shape the SUGGESTED workout only ----------
console.log("");
const squatSlot = slotsDoc.slots.find((s) => data.optionsBySlot.get(s.slot_id)[0].exercise_key === "back_squat");
check("back squat is tagged for knee and lower back", (data.limitationsByExercise.get("back_squat") || []).includes("knee"));
const noLimits = Rana.plan.pickSuggestedOption(squatSlot, data, []);
check("no limitations: the main exercise is suggested", noLimits.exerciseKey === "back_squat" && !noLimits.substituted && noLimits.caution.length === 0);
// Real data, caution path: the squat slot's alternatives (hack squat, goblet
// squat) are also knee-dominant, so a knee limitation can't swap them out.
const withKnee = Rana.plan.pickSuggestedOption(squatSlot, data, ["knee"]);
check("real data: back squat slot + knee limitation keeps the squat with a caution (all alternatives load the knee)",
  withKnee.exerciseKey === "back_squat" && withKnee.caution.includes("knee") && !withKnee.substituted);
// Real data, swap path: find any slot whose main exercise loads the wrist but
// has a wrist-friendly alternative.
const wristSlot = slotsDoc.slots.find((s) => {
  const opts = data.optionsBySlot.get(s.slot_id);
  const loads = (k) => (data.limitationsByExercise.get(k) || []).includes("wrist");
  return loads(opts[0].exercise_key) && opts.some((o) => !loads(o.exercise_key));
});
const wristPick = Rana.plan.pickSuggestedOption(wristSlot, data, ["wrist"]);
check("real data: wrist limitation swaps to the first alternative that doesn't load the wrist",
  wristPick.substituted && wristPick.caution.length === 0 && !(data.limitationsByExercise.get(wristPick.exerciseKey) || []).includes("wrist"),
  `${data.optionsBySlot.get(wristSlot.slot_id)[0].exercise_key} → ${wristPick.exerciseKey}`);
const fakeData = {
  optionsBySlot: new Map([[1, [{ exercise_key: "a" }, { exercise_key: "b" }]]]),
  limitationsByExercise: new Map([["a", ["knee"]], ["b", ["knee", "wrist"]]]),
};
const allConflict = Rana.plan.pickSuggestedOption({ slot_id: 1 }, fakeData, ["knee"]);
check("every option conflicts: keeps the main exercise with a caution", allConflict.exerciseKey === "a" && allConflict.caution.join() === "knee" && !allConflict.substituted);
// A swap never makes the workout list the same exercise twice.
const dupData = {
  optionsBySlot: new Map([
    [1, [{ exercise_key: "press" }]], // slot 1 uses "press" as written
    [2, [{ exercise_key: "deadlift_x" }, { exercise_key: "press" }, { exercise_key: "row" }]], // main conflicts; "press" is taken
    [3, [{ exercise_key: "deadlift_y" }, { exercise_key: "press" }]], // main conflicts; the only clean alternative is taken
  ]),
  limitationsByExercise: new Map([["deadlift_x", ["lower-back"]], ["deadlift_y", ["lower-back"]]]),
  exerciseByKey: new Map([["deadlift_x", { exercise_name: "Deadlift X" }]]),
};
const dupPicks = Rana.plan.suggestWorkout([{ slot_id: 1 }, { slot_id: 2 }, { slot_id: 3 }], dupData, ["lower-back"]);
check("a swap skips an exercise already used earlier in the workout", dupPicks[1].exerciseKey === "row" && dupPicks[1].substituted, dupPicks[1].exerciseKey);
check("if the only clean alternative is already used, it repeats rather than losing the swap", dupPicks[2].exerciseKey === "press" && dupPicks[2].substituted);
// ...including exercises that a LATER slot uses as its main exercise.
const laterData = {
  optionsBySlot: new Map([
    [1, [{ exercise_key: "deadlift_x" }, { exercise_key: "leg_press" }, { exercise_key: "hack" }]], // swap candidates: leg_press is slot 2's main
    [2, [{ exercise_key: "leg_press" }]],
  ]),
  limitationsByExercise: new Map([["deadlift_x", ["lower-back"]]]),
  exerciseByKey: new Map(),
};
const laterPicks = Rana.plan.suggestWorkout([{ slot_id: 1 }, { slot_id: 2 }], laterData, ["lower-back"]);
check("a swap also avoids an exercise a LATER slot uses as its main", laterPicks[0].exerciseKey === "hack" && laterPicks[1].exerciseKey === "leg_press", laterPicks.map((p) => p.exerciseKey).join(", "));
check("swap text names the original exercise and the joint", Rana.plan.swapText(dupPicks[1], dupData) === "Swapped from Deadlift X to protect your lower back.", Rana.plan.swapText(dupPicks[1], dupData));
check("caution text names the joint", Rana.plan.cautionText(["lower-back"]).includes("lower back"));
check("a profile's 'none' limitation is ignored", Rana.plan.activeLimitations({ limitations: ["none"] }).length === 0);

// ---------- 6. Levels, tiers, stats ----------
console.log("");
check("level curve: L5 = 704, L50 = 105,644", Rana.game.xpForLevel(5) === 704 && Rana.game.xpForLevel(50) === 105644);
check("levelForXp boundaries", Rana.game.levelForXp(0) === 1 && Rana.game.levelForXp(43) === 1 && Rana.game.levelForXp(44) === 2 && Rana.game.levelForXp(105644) === 50 && Rana.game.levelForXp(105643) === 49);
check("tiers", ["SPARK", "IGNITION", "AWAKENED", "ASCENDED", "TRANSCENDENT", "MYTHIC"].join() === [1, 5, 13, 22, 36, 50].map(Rana.game.tierForLevel).join());
check("stats start at 0", Rana.game.statValue(0) === 0);


// ---------- 7. Two plans: switching, own-plan days, saved plans (2026-11-27) ----------
console.log("");
const OWN = Rana.plan.OWN_WORKOUT;
const ownMap = { Mon: null, Tue: OWN, Wed: null, Thu: OWN, Fri: null, Sat: null, Sun: null };
const ownNames = { Tue: "Push", Thu: "Pull" };
const switchDate = mondays[2]; // the start of week 3
const switched = {
  ...plan3,
  weekday_map: ownMap,
  own_day_names: ownNames,
  schedule_history: [
    { effective_from: "0000-01-01", weekday_map: plan3.weekday_map, own_day_names: {} },
    { effective_from: switchDate, weekday_map: ownMap, own_day_names: ownNames },
  ],
};
const before = ledgerOf(h, plan3, addDays(S2, 20));
const after = ledgerOf(h, switched, addDays(S2, 20));
const sameDay = (a, b) => a.totalXp === b.totalXp && a.streak === b.streak && a.restDay === b.restDay && a.missed === b.missed && a.completed === b.completed;
const pastDates = [...before.entries.keys()].filter((d) => d < switchDate);
check("switching plans leaves every earlier day's XP, streak and rest/missed status identical",
  pastDates.length > 0 && pastDates.every((d) => sameDay(before.entries.get(d), after.entries.get(d))), `${pastDates.length} days compared`);
check("after the switch, the new plan's days apply (Mon is now rest, Tue is Push)",
  Rana.plan.getSessionForDate(switchDate, switched, data, []).isRestDay &&
  Rana.plan.getSessionForDate(addDays(switchDate, 1), switched, data, []).workout.day_name === "Push");
const oneEntry = { ...plan3, schedule_history: [{ effective_from: "0000-01-01", weekday_map: plan3.weekday_map }] };
check("a plan with no history behaves exactly as one with a single matching entry",
  ledgerOf(h, oneEntry, addDays(S2, 20)).totalXp === before.totalXp && before.totalXp > 0);

// Own-plan days: the user builds the workout while logging.
const ownPlan = { split_id: three.split_id, start_date: S2, status: "active", active_plan_id: "own", weekday_map: ownMap, own_day_names: ownNames };
function ownSession(date, nSets) {
  const session = makeSession(date, "planned", OWN, "Push");
  session.exercises = ["own_test_lift"];
  const sets = [];
  for (let k = 0; k < nSets; k++) sets.push({ session_id: session.session_id, date, slot_id: null, exercise_key: "own_test_lift", set_index: k + 1, weight: 80, reps: 8 });
  return { session, sets };
}
const tue = addDays(S2, 1), thu = addDays(S2, 3);
const ownL = ledgerOf([ownSession(tue, 3), ownSession(thu, 3)], ownPlan, thu);
check("an own-plan day with 3 sets counts as following the plan (session XP, streak grows)",
  ownL.entries.get(tue).completed && ownL.entries.get(tue).sessionXp === 100 && ownL.entries.get(thu).streak === 2);
const ownShort = ledgerOf([ownSession(tue, 2)], ownPlan, addDays(S2, 2)).entries.get(tue);
check("an own-plan day with under 3 sets earns no session XP", !ownShort.completed && ownShort.sessionXp === 0);
const ownRest = ledgerOf([ownSession(S2, 4)], ownPlan, S2).entries.get(S2);
check("an own-plan rest day earns no session XP", ownRest.restDay && ownRest.sessionXp === 0);

// Saved plans and switching through storage.
store.clear();
Rana.storage.savePlan({ ...plan3, start_date: "2026-01-05" });
const migratedSaved = Rana.storage.getSavedPlans();
check("an existing plan becomes the saved 'rana' plan", migratedSaved.rana && migratedSaved.rana.split_id === plan3.split_id && migratedSaved.own === null);
Rana.storage.saveSavedPlan({ plan_id: "own", kind: "own", name: "My plan", weekday_map: ownMap, own_day_names: ownNames });
const act = Rana.plan.activatePlan("own");
const today = Rana.plan.todayStr();
check("activating the own plan switches the schedule from today and keeps the old one in the history",
  act.effectiveFrom === today && act.plan.active_plan_id === "own" && act.plan.weekday_map.Tue === OWN &&
  act.plan.schedule_history.length === 2 && act.plan.schedule_history[0].weekday_map.Mon === plan3.weekday_map.Mon);
check("plan.split_id stays Rana's split while the own plan is active", act.plan.split_id === plan3.split_id);
const back = Rana.plan.activatePlan("rana");
check("switching back the same day replaces today's entry instead of stacking", back.plan.schedule_history.length === 2 && back.plan.weekday_map.Mon === plan3.weekday_map.Mon);
Rana.storage.saveProfile({ goal: "build-muscle", training_days_per_week: 3, training_weekdays: ["Mon", "Wed", "Fri"] });
Rana.plan.activatePlan("own");
const ownBefore = JSON.stringify(Rana.storage.getPlan().weekday_map);
check("repairPlan leaves an intact own plan alone", Rana.plan.repairPlan(data) === false && JSON.stringify(Rana.storage.getPlan().weekday_map) === ownBefore);
const broken = Rana.storage.getPlan();
broken.schedule_history[0].weekday_map = { ...broken.schedule_history[0].weekday_map, Mon: "GONE_WORKOUT" };
Rana.storage.savePlan(broken);
Rana.plan.repairPlan(data);
const fixed = Rana.storage.getPlan();
check("repairPlan fixes a removed workout in the history but keeps the own-plan days",
  data.workoutById.has(fixed.schedule_history[0].weekday_map.Mon) && JSON.stringify(fixed.weekday_map) === ownBefore);
// A switch after training today waits until tomorrow.
Rana.storage.startSession({ type: "freestyle", title: "x", date: today });
check("a switch after a workout today starts tomorrow", Rana.plan.switchEffectiveDate() > today);
store.clear();

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
