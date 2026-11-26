// Leveling system check: runs the app's REAL plan.js + game.js (no copies
// of the formulas) against fake workout histories, then prints PASS/FAIL
// for each rule plus a 3-year simulation. No dependencies beyond Node.
//
// Usage, from the project folder:
//   node scripts/test_leveling.js
//
// Run it after changing anything in XP_RULES or the level curve in
// game.js. Exits non-zero if any check fails, like validate_library.py.
//
// How it works: game.js and plan.js are written for the browser (they
// attach to `window.Rana`), so this loads them into a sandbox with a fake
// `window` using Node's built-in `vm` module, and builds the same lookup
// maps data.js builds from data/*.json.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = process.argv[2] || path.join(__dirname, "..");
const ctx = { window: {}, console, Math, Date, Map, Set, Number, String };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["plan.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx);
}
const { Rana } = ctx;
const j = (f) => JSON.parse(fs.readFileSync(path.join(dir, "data", f), "utf8"));
const exercises = j("exercises.json"), splits = j("splits.json"), workouts = j("workouts.json"), slotsDoc = j("slots.json");
const group = (arr, key) => { const m = new Map(); arr.forEach((x) => { const l = m.get(x[key]) || []; l.push(x); m.set(x[key], l); }); return m; };
const data = {
  slots: slotsDoc.slots,
  exerciseByKey: new Map(exercises.map((e) => [e.exercise_key, e])),
  workoutById: new Map(workouts.map((w) => [w.workout_id, w])),
  slotsByWorkout: group(slotsDoc.slots, "workout_id"),
  optionsBySlot: group(slotsDoc.slot_options, "slot_id"),
};
data.slotsByWorkout.forEach((l) => l.sort((a, b) => a.slot_order - b.slot_order));
data.optionsBySlot.forEach((l) => l.sort((a, b) => a.option_rank - b.option_rank));

function makePlan(splitId, weekdays, startDate) {
  const ws = workouts.filter((w) => w.split_id === splitId).sort((a, b) => a.day_order - b.day_order);
  return { split_id: splitId, start_date: startDate, status: "active", weekday_map: Rana.plan.buildWeekdayMap(ws, weekdays) };
}
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return Rana.plan.toDateStr(d); };
let failures = 0;
const check = (label, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`); if (!cond) failures++; };

// ---------- 1. Simulation: 4 days/week for 3 years, never missing ----------
const four = splits.find((s) => s.days_per_week === 4);
const START = "2027-01-04"; // a Monday
const plan4 = makePlan(four.split_id, ["Mon", "Tue", "Thu", "Fri"], START);
const sets = [];
const baseE1rm = new Map();
const END = addDays(START, 3 * 364 - 1);
for (let d = START, week = 0, i = 0; d <= END; i++, d = addDays(START, i)) {
  week = Math.floor(i / 7);
  const s = Rana.plan.getSessionForDate(d, plan4, data, []);
  if (s.isRestDay) continue;
  const deload = week % 6 === 5;
  s.slots.forEach((slot) => {
    const key = data.optionsBySlot.get(slot.slot_id)[0].exercise_key;
    if (!baseE1rm.has(key)) baseE1rm.set(key, 100);
    // Strength curve: about +60% over the long run, most of it in year 1.
    const target = baseE1rm.get(key) * (1 + 0.6 * (1 - Math.exp(-week / 40))) * (deload ? 0.85 : 1);
    const reps = 8;
    const weight = Math.floor(target / (1 + reps / 30) / 5) * 5;
    for (let k = 0; k < slot.working_sets; k++) {
      sets.push({ date: d, slot_id: slot.slot_id, exercise_key: key, weight, reps, rep_range: slot.rep_range });
    }
  });
}
const ledger = Rana.game.computeXpLedger(sets, plan4, data, END);
const level = Rana.game.levelForXp(ledger.totalXp);
const strengthXp = [...ledger.entries.values()].reduce((a, e) => a + e.strengthXp, 0);
console.log(`\nSimulated ${four.split_name} (4 days/wk), 3 years, no misses:`);
console.log(`  sessions ${ledger.sessionsCompleted}, total XP ${ledger.totalXp.toLocaleString()} (strength ${strengthXp.toLocaleString()}), level ${level}, tier ${Rana.game.tierForLevel(level)}`);
for (const [label, days] of [["1 year", 364], ["2 years", 728]]) {
  const l = Rana.game.computeXpLedger(sets.filter((s) => s.date < addDays(START, days)), plan4, data, addDays(START, days - 1));
  const lv = Rana.game.levelForXp(l.totalXp);
  console.log(`  at ${label}: level ${lv} (${Rana.game.tierForLevel(lv)})`);
}
check("3 years at 4 days/week lands near Mythic (Level 49-53)", level >= 49 && level <= 53, `level ${level}`);
check("titles earned after 3 years", Rana.game.earnedTitles(ledger).length === 4, Rana.game.earnedTitles(ledger).map((t) => t.name).join(", "));

// ---------- 2. Rule checks on a small hand-built history ----------
const three = splits.find((s) => s.days_per_week === 3);
const S2 = "2027-01-04";
const plan3 = makePlan(three.split_id, ["Mon", "Wed", "Fri"], S2);
const mon = Rana.plan.getSessionForDate(S2, plan3, data, []);
const slot = mon.slots[0];
const benchKey = data.optionsBySlot.get(slot.slot_id)[0].exercise_key;
const fullSession = (date, weight, reps) => {
  const out = [];
  const s = Rana.plan.getSessionForDate(date, plan3, data, []);
  s.slots.forEach((sl) => {
    const key = data.optionsBySlot.get(sl.slot_id)[0].exercise_key;
    for (let k = 0; k < sl.working_sets; k++) {
      out.push({ date, slot_id: sl.slot_id, exercise_key: key, weight: key === benchKey ? weight : 50, reps: key === benchKey ? reps : 10 });
    }
  });
  return out;
};
// Four Mondays: 185x6 three times (calibration), then 185x7.
let h = [];
const mondays = [0, 7, 14, 21].map((n) => addDays(S2, n));
mondays.slice(0, 3).forEach((d) => (h = h.concat(fullSession(d, 185, 6))));
// Wed/Fri of weeks 1-3 done too, so the streak stays intact.
[2, 4, 9, 11, 16, 18].forEach((n) => (h = h.concat(fullSession(addDays(S2, n), 0, 0))));
let L = Rana.game.computeXpLedger(h, plan3, data, mondays[2]);
check("no strength XP during the 3 calibration sessions", [...L.entries.values()].every((e) => e.strengthXp === 0));
h = h.concat(fullSession(mondays[3], 185, 7));
L = Rana.game.computeXpLedger(h, plan3, data, mondays[3]);
const e4 = L.entries.get(mondays[3]);
const benchInc = e4.increases.find((i) => i.exerciseKey === benchKey);
check("185x6 -> 185x7 earns 28 XP (+2.8%)", benchInc && benchInc.xp === 28, benchInc ? `${benchInc.percent.toFixed(2)}% → ${benchInc.xp} XP` : "no increase found");
check("session XP is 100 + streak bonus", e4.sessionXp === 100 && e4.streakBonusXp === Math.round(100 * Math.min(e4.streak, 10) * 0.05), `streak ${e4.streak}, bonus ${e4.streakBonusXp}`);

// Cap: a huge jump caps at 60.
const capH = h.concat(fullSession(addDays(S2, 28), 245, 7));
const capE = Rana.game.computeXpLedger(capH, plan3, data, addDays(S2, 28)).entries.get(addDays(S2, 28));
check("a huge jump is capped at 60 XP", capE.increases.find((i) => i.exerciseKey === benchKey).xp === 60);

// 16+ reps ignored.
const highH = h.concat(fullSession(addDays(S2, 28), 185, 16));
const highE = Rana.game.computeXpLedger(highH, plan3, data, addDays(S2, 28)).entries.get(addDays(S2, 28));
check("sets of 16+ reps don't count toward strength XP", !highE.increases.find((i) => i.exerciseKey === benchKey));

// Missing halves the streak: miss Wed + Fri of week 4.
const missL = Rana.game.computeXpLedger(h, plan3, data, addDays(S2, 26));
const streakBefore = L.entries.get(mondays[3]).streak;
check("two misses halve the streak twice", missL.currentStreak === Math.floor(Math.floor(streakBefore / 2) / 2), `${streakBefore} → ${missL.currentStreak}`);
check("missed days earn 0 XP", missL.entries.get(addDays(S2, 23)).totalXp === 0 && missL.entries.get(addDays(S2, 23)).missed);

// Under half the sets: no session XP.
const partial = fullSession(addDays(S2, 28), 185, 6);
const fewSets = h.concat(partial.slice(0, Math.floor(partial.length * 0.4)));
const partE = Rana.game.computeXpLedger(fewSets, plan3, data, addDays(S2, 28)).entries.get(addDays(S2, 28));
check("logging under half the sets earns no session XP", partE.sessionXp === 0 && !partE.completed);

// Today, not finished yet, is not counted as missed.
const todayL = Rana.game.computeXpLedger(h, plan3, data, addDays(S2, 23));
check("today in progress isn't marked missed", !todayL.entries.get(addDays(S2, 23)).missed);

// Bodyweight: 8 -> 10 reps at 0 weight = +25%.
let bw = [];
[0, 7, 14, 21].forEach((n, i) => {
  bw.push({ date: addDays(S2, n), slot_id: slot.slot_id, exercise_key: "pull_up_test", weight: 0, reps: i < 3 ? 8 : 10 });
});
const bwE = Rana.game.computeXpLedger(bw, plan3, data, addDays(S2, 21)).entries.get(addDays(S2, 21));
const bwInc = bwE.increases[0];
check("bodyweight 8 -> 10 reps = +25%, capped to 60 XP", bwInc && bwInc.mode === "bodyweight" && Math.round(bwInc.percent) === 25 && bwInc.xp === 60, bwInc ? `${bwInc.percent}% → ${bwInc.xp}` : "none");

// Levels and tiers.
check("level curve: L5 = 704, L50 = 105,644", Rana.game.xpForLevel(5) === 704 && Rana.game.xpForLevel(50) === 105644);
check("levelForXp boundaries", Rana.game.levelForXp(0) === 1 && Rana.game.levelForXp(43) === 1 && Rana.game.levelForXp(44) === 2 && Rana.game.levelForXp(105644) === 50 && Rana.game.levelForXp(105643) === 49);
check("tiers", ["SPARK", "IGNITION", "AWAKENED", "ASCENDED", "TRANSCENDENT", "MYTHIC"].join() === [1, 5, 13, 22, 36, 50].map(Rana.game.tierForLevel).join());
check("stats start at 0", Rana.game.statValue(0) === 0);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
