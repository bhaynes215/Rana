// Build-your-own-plan screen. The user's own plan is just a week: seven
// rows, each Rest or Training, and every training day gets a short name
// ("Push", "Arms"…). No exercises are chosen here; on a training day the
// user builds the workout while logging (active-session.js), the way a
// freestyle workout works.
//
// ?from=results comes back to the results screen, anything else to the Plan
// tab. Editing an existing own plan opens with its days filled in.

const QUICK_NAMES = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Chest", "Back", "Shoulders", "Arms"];

const params = new URLSearchParams(window.location.search);
const returnTo = params.get("from") === "results" ? "results.html" : "my-plan.html";

// The week being edited: { Mon: { training: true, name: "Push" }, ... }
const week = {};
let savedJson = ""; // what the form looked like when it opened, to detect changes

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function snapshot() {
  return JSON.stringify({ name: document.getElementById("plan-name").value.trim(), week });
}

function updateCount() {
  const n = Rana.plan.WEEKDAY_ORDER.filter((d) => week[d].training).length;
  document.getElementById("builder-count").textContent =
    n === 0 ? "No training days yet" : `${n} ${n === 1 ? "day" : "days"} / week${n === 7 ? " · no rest days" : ""}`;
}

// One weekday row: a Rest / Training switch, and for a training day a name
// box with quick-pick names underneath.
function buildRow(day) {
  const li = el("li", "panel builder-day");
  const head = el("div", "builder-day-head");
  head.appendChild(el("span", "plan-hero-dow", day));

  const toggle = el("div", "segmented builder-toggle");
  toggle.setAttribute("role", "group");
  toggle.setAttribute("aria-label", `${day}: rest or training`);
  const restBtn = el("button", "segmented-btn", "Rest");
  const trainBtn = el("button", "segmented-btn", "Training");
  [restBtn, trainBtn].forEach((b) => (b.type = "button"));
  toggle.append(restBtn, trainBtn);
  head.appendChild(toggle);
  li.appendChild(head);

  const nameWrap = el("div", "builder-day-name");
  const input = el("input");
  input.type = "text";
  input.maxLength = 24;
  input.autocomplete = "off";
  input.placeholder = "Name this day, e.g. Push";
  input.setAttribute("aria-label", `${day} workout name`);
  input.value = week[day].name;
  input.addEventListener("input", () => {
    week[day].name = input.value;
    refreshChips();
  });

  const chips = el("div", "builder-chips");
  const chipButtons = QUICK_NAMES.map((label) => {
    const chip = el("button", "builder-chip", label);
    chip.type = "button";
    chip.addEventListener("click", () => {
      input.value = label;
      week[day].name = label;
      refreshChips();
    });
    chips.appendChild(chip);
    return chip;
  });
  function refreshChips() {
    chipButtons.forEach((c) => c.setAttribute("aria-pressed", String(c.textContent === input.value.trim())));
  }
  nameWrap.append(input, chips);
  li.appendChild(nameWrap);

  function render() {
    const training = week[day].training;
    restBtn.setAttribute("aria-pressed", String(!training));
    trainBtn.setAttribute("aria-pressed", String(training));
    nameWrap.hidden = !training;
    li.classList.toggle("builder-day--rest", !training);
    refreshChips();
    updateCount();
  }
  restBtn.addEventListener("click", () => {
    week[day].training = false;
    render();
  });
  trainBtn.addEventListener("click", () => {
    week[day].training = true;
    render();
    input.focus();
  });
  render();
  return li;
}

async function main() {
  const profile = Rana.storage.getProfile();
  const plan = Rana.storage.getPlan();
  if (!profile || !plan) {
    window.location.href = "onboarding.html";
    return;
  }
  await Rana.data.load(); // runs the plan repair, like every screen

  const existing = Rana.storage.getSavedPlans().own;
  if (existing) document.getElementById("builder-title").textContent = "Edit your plan";
  document.getElementById("plan-name").value = existing ? existing.name : "My plan";
  Rana.plan.WEEKDAY_ORDER.forEach((day) => {
    const isTraining = existing ? existing.weekday_map[day] === Rana.plan.OWN_WORKOUT : false;
    week[day] = { training: isTraining, name: isTraining ? existing.own_day_names[day] || "" : "" };
  });

  const list = document.getElementById("builder-days");
  Rana.plan.WEEKDAY_ORDER.forEach((day) => list.appendChild(buildRow(day)));
  savedJson = snapshot();

  const statusEl = document.getElementById("builder-status");
  function showError(message) {
    statusEl.textContent = message;
    statusEl.classList.add("status-message--error");
  }

  document.getElementById("save-btn").addEventListener("click", () => {
    statusEl.textContent = "";
    const trainingDays = Rana.plan.WEEKDAY_ORDER.filter((d) => week[d].training);
    if (trainingDays.length === 0) return showError("Pick at least one training day.");
    const unnamed = trainingDays.filter((d) => !week[d].name.trim());
    if (unnamed.length) return showError(`Give ${unnamed.join(", ")} a name, like Push or Legs.`);

    const weekdayMap = {};
    const ownDayNames = {};
    Rana.plan.WEEKDAY_ORDER.forEach((d) => {
      weekdayMap[d] = week[d].training ? Rana.plan.OWN_WORKOUT : null;
      if (week[d].training) ownDayNames[d] = week[d].name.trim();
    });

    Rana.plan.updateSavedPlan({
      plan_id: "own",
      kind: "own",
      name: document.getElementById("plan-name").value.trim() || "My plan",
      weekday_map: weekdayMap,
      own_day_names: ownDayNames,
      created_at: existing ? existing.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    window.location.href = returnTo;
  });

  document.getElementById("cancel-btn").addEventListener("click", async () => {
    if (snapshot() !== savedJson) {
      const sure = await Rana.ui.confirm({ message: "Leave without saving? Your changes to this plan are lost.", confirmLabel: "Leave" });
      if (!sure) return;
    }
    window.location.href = returnTo;
  });
}

main();
