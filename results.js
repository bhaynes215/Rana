// Results / projection screen (PRD section 9) — the emotional centerpiece.
// Reads the profile + draft plan the questionnaire just saved, computes
// projected stats (from 0) and nutrition targets, and reveals them in
// sequence. Locking in sets the plan's start_date to today and moves on to
// account creation.

const STATS = ["STR", "AGI", "VIT", "INT"];

function renderStatBar(container, value, max) {
  container.innerHTML = "";
  const filledCount = Math.max(0, Math.min(20, Math.round((value / max) * 20)));
  for (let i = 0; i < 20; i++) {
    const span = document.createElement("span");
    if (i < filledCount) span.classList.add("filled");
    container.appendChild(span);
  }
}

// Everyone starts every stat at 0 (the app can't know how strong you are
// before you've trained), so there's no "now" row — just what 12 weeks of
// following this plan builds, starting from empty bars. All four bars share
// one scale so their relative sizes mean something.
function buildStatBlocks(projected) {
  const container = document.getElementById("stat-blocks");
  container.innerHTML = "";
  const max = Math.max(...STATS.map((s) => projected[s])) * 1.15;

  STATS.forEach((stat) => {
    const block = document.createElement("div");
    block.style.marginBottom = "16px";

    const label = document.createElement("p");
    label.className = "stat-label";
    label.textContent = stat;
    block.appendChild(label);

    const projRow = document.createElement("div");
    projRow.className = "stat-row";
    const projTag = document.createElement("span");
    projTag.textContent = "12WK";
    const projBar = document.createElement("div");
    projBar.className = "stat-bar projected";
    const projValue = document.createElement("span");
    projValue.className = "stat-value num";
    projValue.textContent = projected[stat];
    projRow.append(projTag, projBar, projValue);
    block.appendChild(projRow);

    container.appendChild(block);

    renderStatBar(projBar, projected[stat], max);
  });
}

function formatWeekdays(days) {
  const order = Rana.plan.WEEKDAY_ORDER;
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(" · ");
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

  const projected = Rana.game.computeProjectedStats(profile);
  buildStatBlocks(projected);

  const quotes = await fetch("data/quotes.json").then((r) => r.json());
  const resultsQuotes = quotes.filter((q) => q.context.includes("results"));
  const quote = resultsQuotes[Math.floor(Math.random() * resultsQuotes.length)];
  document.getElementById("quote-text").textContent = `"${quote.text}"`;
  document.getElementById("quote-attribution").textContent = `— ${quote.author}`;

  document.getElementById("plan-assignment-name").textContent =
    `ASSIGNED: ${split.split_name.toUpperCase()} — ${split.days_per_week} DAY`;
  document.getElementById("plan-assignment-days").textContent = formatWeekdays(plan.training_weekdays);

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
