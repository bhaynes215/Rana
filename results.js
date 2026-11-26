// Results / projection screen (PRD section 9) — the emotional centerpiece.
// Reads the profile + draft plan the questionnaire just saved, computes the
// 12-week route (tier milestones + training phases) and nutrition targets,
// and reveals them in
// sequence. Locking in sets the plan's start_date to today and moves on to
// account creation.

// --- The 12-week route ---
// What each phase means, in the words shown on screen.
const PHASE_INFO = {
  calibration: {
    name: "Calibration",
    text: "Find your working weights. Every session earns XP; strength XP unlocks once an exercise has 3 sessions logged.",
  },
  build: {
    name: "Build",
    text: "Beat your best on each lift. Every new best earns XP, and bigger jumps earn more.",
  },
  deload: {
    name: "Deload",
    text: "A lighter week built into your split so your body can recover. It still counts: show up and keep your streak.",
  },
};

function titleCaseTier(tier) {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

// Groups consecutive weeks with the same phase into ranges, e.g.
// [cal, cal, cal, build, build, deload] → Weeks 1–3 Calibration,
// Weeks 4–5 Build, Week 6 Deload.
function phaseRanges(weeks) {
  const ranges = [];
  weeks.forEach((w) => {
    const last = ranges[ranges.length - 1];
    if (last && last.phase === w.phase) last.end = w.week;
    else ranges.push({ phase: w.phase, start: w.week, end: w.week });
  });
  return ranges;
}

// "Week 6", "Weeks 1–3", or for a phase that comes back: "Weeks 4–5, 7–11".
function weekLabel(ranges) {
  const parts = ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`));
  const single = ranges.length === 1 && ranges[0].start === ranges[0].end;
  return `${single ? "Week" : "Weeks"} ${parts.join(", ")}`;
}

function buildRoute(route) {
  // Headline: the level you reach by week 12 if you never miss — a floor,
  // since strength gains aren't counted (see forecastRoute in game.js).
  document.getElementById("route-final-level").textContent = `LV ${route.finalLevel}`;
  const tierEl = document.getElementById("route-final-tier");
  tierEl.textContent = route.finalTier;
  tierEl.dataset.tier = route.finalTier;
  document.getElementById("route-sub").textContent =
    `If you complete all ${route.sessions} sessions. Strength gains push it higher.`;

  // Milestones: if two tiers land in the same week (possible on a 6-day
  // plan), only the higher one gets a marker on the track.
  const markerByWeek = new Map();
  route.milestones.forEach((m) => markerByWeek.set(m.week, m));

  // The track: a 12-column grid, three rows (markers, phases, week numbers).
  const track = document.getElementById("route-track");
  track.innerHTML = "";
  track.style.setProperty("--weeks", route.weeks.length);
  let markerIndex = 0;
  route.weeks.forEach((w) => {
    const marker = document.createElement("span");
    marker.className = "route-marker-slot";
    const m = markerByWeek.get(w.week);
    if (m) {
      const node = document.createElement("span");
      node.className = "route-node";
      node.dataset.tier = m.tier;
      node.style.setProperty("--i", markerIndex++); // staggers the light-up animation
      marker.appendChild(node);
    }
    marker.style.gridColumn = w.week;
    marker.style.gridRow = 1;

    const cell = document.createElement("span");
    cell.className = "route-cell";
    cell.dataset.phase = w.phase;
    cell.style.gridColumn = w.week;
    cell.style.gridRow = 2;
    cell.style.setProperty("--i", w.week);

    const num = document.createElement("span");
    num.className = "route-week-num num";
    num.textContent = w.week;
    num.style.gridColumn = w.week;
    num.style.gridRow = 3;

    track.append(marker, cell, num);
  });

  // Milestone list, readable at any screen width (the track is too narrow
  // on a phone to fit tier names above each marker).
  const msList = document.getElementById("route-milestones");
  msList.innerHTML = "";
  [...markerByWeek.values()].forEach((m) => {
    const li = document.createElement("li");
    li.dataset.tier = m.tier;
    li.innerHTML =
      `<span class="route-ms-week num">${m.week === 1 ? "Start" : `Week ${m.week}`}</span>` +
      `<span class="route-ms-tier">${m.tier}</span>` +
      `<span class="route-ms-level num">LV ${m.level}</span>`;
    msList.appendChild(li);
  });

  // Phase legend: one entry per phase, even when a phase comes back
  // (Build → Deload → Build), listed in the order each first appears.
  const rangesByPhase = new Map();
  phaseRanges(route.weeks).forEach((r) => {
    const list = rangesByPhase.get(r.phase) || [];
    list.push(r);
    rangesByPhase.set(r.phase, list);
  });

  const phaseList = document.getElementById("route-phases");
  phaseList.innerHTML = "";
  rangesByPhase.forEach((ranges, phase) => {
    const info = PHASE_INFO[phase];
    const li = document.createElement("li");
    li.dataset.phase = phase;
    li.innerHTML =
      `<span class="route-phase-swatch" aria-hidden="true"></span>` +
      `<span class="route-phase-body"><span class="route-phase-title">${weekLabel(ranges)} · ${info.name}</span>` +
      `<span class="route-phase-text">${info.text}</span></span>`;
    phaseList.appendChild(li);
  });
}

// --- The split (the headline of this screen) ---
// Shows the split's name, a one-line summary, and the user's actual week:
// all seven days, Monday first, each training day with its workout and
// focus on the weekday it will always fall on (fixed weekly schedule), and
// rest days marked as rest rather than left blank.
function buildPlanHero(split, plan, data) {
  // "Upper / Lower (4-Day)" → "Upper / Lower". The parenthetical either
  // repeats the day count or lists the days, both of which the week list
  // below already shows.
  document.getElementById("plan-hero-name").textContent = split.split_name.split(" (")[0];

  const trainingDays = Rana.plan.WEEKDAY_ORDER.filter((d) => plan.weekday_map[d]);
  document.getElementById("plan-hero-meta").textContent =
    `${trainingDays.length} days / week · ~${split.est_session_minutes} min sessions · ` +
    `${split.primary_goal} · ${split.experience_level}`;

  const weekEl = document.getElementById("plan-hero-week");
  weekEl.innerHTML = "";
  Rana.plan.WEEKDAY_ORDER.forEach((day) => {
    const workout = data.workoutById.get(plan.weekday_map[day]);
    const li = document.createElement("li");
    li.className = workout ? "plan-hero-day" : "plan-hero-day plan-hero-day--rest";

    const dayEl = document.createElement("span");
    dayEl.className = "plan-hero-dow";
    dayEl.textContent = day;

    const body = document.createElement("span");
    body.className = "plan-hero-day-body";
    const name = document.createElement("span");
    name.className = "plan-hero-workout";
    name.textContent = workout ? workout.day_name : "Rest";
    body.appendChild(name);
    if (workout) {
      const focus = document.createElement("span");
      focus.className = "plan-hero-focus";
      focus.textContent = workout.session_focus;
      body.appendChild(focus);
    }

    li.append(dayEl, body);
    weekEl.appendChild(li);
  });

  document.getElementById("plan-hero-why").textContent = `Built for: ${split.best_for}`;
}

// --- Sequenced reveal ---
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let revealTimers = [];

function runReveal() {
  const steps = Array.from(document.querySelectorAll(".reveal-step"));
  const maxStep = Math.max(...steps.map((el) => Number(el.dataset.step)));

  if (reduceMotion) {
    steps.forEach((el) => el.classList.add("shown"));
    return;
  }

  for (let s = 0; s <= maxStep; s++) {
    const timer = setTimeout(() => {
      steps.filter((el) => Number(el.dataset.step) === s).forEach((el) => el.classList.add("shown"));
    }, s * 550);
    revealTimers.push(timer);
  }
}

function skipReveal() {
  revealTimers.forEach(clearTimeout);
  revealTimers = [];
  document.querySelectorAll(".reveal-step").forEach((el) => el.classList.add("shown"));
}

document.getElementById("results-screen").addEventListener("click", (event) => {
  if (event.target.id === "lock-in-btn") return; // don't let the tap-to-skip eat the real button
  skipReveal();
});

// --- Main ---
async function main() {
  const profile = Rana.storage.getProfile();
  const plan = Rana.storage.getPlan();
  if (!profile || !plan) {
    window.location.href = "onboarding.html";
    return;
  }

  const data = await Rana.data.load();
  const split = data.splitById.get(plan.split_id);

  buildPlanHero(split, plan, data);

  // Sessions per week = weekdays that actually have a workout assigned
  // (if someone picks more days than the split has, the extras are rest).
  const sessionsPerWeek = Object.values(plan.weekday_map || {}).filter(Boolean).length || split.days_per_week;
  buildRoute(Rana.game.forecastRoute(sessionsPerWeek, split.deload_every_weeks));

  const quotes = await fetch("data/quotes.json").then((r) => r.json());
  const resultsQuotes = quotes.filter((q) => q.context.includes("results"));
  const quote = resultsQuotes[Math.floor(Math.random() * resultsQuotes.length)];
  document.getElementById("quote-text").textContent = `"${quote.text}"`;
  document.getElementById("quote-attribution").textContent = `— ${quote.author}`;

  const nutrition = Rana.game.computeCalorieTargets(profile);
  document.getElementById("nutrition-calories").textContent = nutrition.calories.toLocaleString();
  document.getElementById("nutrition-macros").textContent =
    `Protein ${nutrition.proteinG}g · Carbs ${nutrition.carbsG}g · Fat ${nutrition.fatG}g`;

  runReveal();

  document.getElementById("lock-in-btn").addEventListener("click", () => {
    plan.start_date = Rana.plan.todayStr();
    plan.status = "active";
    Rana.storage.savePlan(plan);
    window.location.href = "account-creation.html";
  });
}

main();
