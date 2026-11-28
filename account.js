// Account page: your name, level, tier and earned titles, the email, and every
// questionnaire answer with its own Edit.
//
// Most answers just save. Two change Rana's suggested plan:
//   - goal and training days (with which weekdays) pick the split
//     (Rana.plan.matchSplit) and lay it on the weekdays.
// For those, a confirm box says what will change first. The user's own plan
// is never touched by these. If Rana's plan is the active one, the change goes
// through Rana.plan.activatePlan, so past days keep the week they had.
// Limitations only change which exercise a suggested workout starts on, so
// they just save.

// Each answer: how it's shown and how it's edited. The choices match the
// questionnaire (onboarding.html).
const FIELDS = [
  { key: "name", label: "Name", type: "text", maxLength: 40 },
  { key: "gender", label: "Gender", type: "radio", options: [["male", "Male"], ["female", "Female"], ["prefer-not-to-say", "Prefer not to say"]] },
  { key: "age", label: "Age", type: "number", min: 13, max: 100 },
  { key: "height", label: "Height", type: "number", min: 120, max: 230, unit: "cm" },
  { key: "weight_current", label: "Current weight", type: "number", min: 70, max: 500, unit: "lb" },
  { key: "weight_target", label: "Target weight", type: "number", min: 70, max: 500, unit: "lb", optional: true },
  { key: "goal", label: "Primary goal", type: "radio", changesPlan: true, options: [["build-muscle", "Build muscle"], ["lose-fat", "Lose fat"], ["get-stronger", "Get stronger"], ["general-fitness", "General fitness"]] },
  { key: "focus_area", label: "Focus area", type: "radio", options: [["chest-arms", "Chest & arms"], ["back-shoulders", "Back & shoulders"], ["legs-glutes", "Legs & glutes"], ["balanced", "Balanced"]] },
  { key: "fitness_level", label: "Fitness level", type: "radio", options: [["never-trained", "Never trained"], ["returning", "Trained before, returning"], ["consistently", "Training consistently"]] },
  { key: "activity_level", label: "Activity outside the gym", type: "radio", options: [["mostly-sitting", "Mostly sitting"], ["moderately-active", "Moderately active"], ["on-feet-all-day", "On my feet all day"]] },
  { key: "limitations", label: "Work around", type: "checkbox", options: [["knee", "Knee"], ["shoulder", "Shoulder"], ["lower-back", "Lower back"], ["wrist", "Wrist"]] },
  { key: "gym_type", label: "Where you train", type: "radio", options: [["rec-center", "Rec center"], ["commercial-gym", "Commercial gym"], ["apartment-gym", "Apartment gym"]] },
  // Days per week and which weekdays are edited together, so they can't
  // disagree: the count is however many weekdays are ticked (3–6, the range
  // Rana's splits cover).
  { key: "training_weekdays", label: "Training days", type: "weekdays", changesPlan: true },
];

const WEEKDAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

let profile = null;
let data = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// How an answer reads when it isn't being edited.
function displayValue(field, p) {
  const v = p[field.key];
  if (field.type === "radio") return (field.options.find(([val]) => val === v) || [null, "—"])[1];
  if (field.type === "checkbox") {
    const picked = (v || []).filter((x) => x !== "none");
    return picked.length ? picked.map((x) => field.options.find(([val]) => val === x)[1]).join(", ") : "Nothing";
  }
  if (field.type === "weekdays") {
    const days = Rana.plan.WEEKDAY_ORDER.filter((d) => (v || []).includes(d));
    return `${days.length} days · ${days.join(", ")}`;
  }
  if (v === null || v === undefined || v === "") return field.optional ? "Not set" : "—";
  return field.unit ? `${v} ${field.unit}` : String(v);
}

// The edit form for one answer. Returns { node, read } where read() gives
// the new value, or throws an Error with a message to show.
function buildEditor(field, p) {
  const wrap = el("div", "account-edit");
  if (field.type === "text" || field.type === "number") {
    const input = el("input");
    input.type = "text";
    if (field.type === "number") Rana.ui.numericField(input); // digits only, numeric keypad on phones
    if (field.maxLength) input.maxLength = field.maxLength;
    input.value = p[field.key] ?? "";
    input.setAttribute("aria-label", field.label);
    wrap.appendChild(input);
    return {
      node: wrap,
      focus: () => input.focus(),
      read() {
        const raw = input.value.trim();
        if (!raw) {
          if (field.optional) return null;
          throw new Error(`${field.label} can't be empty.`);
        }
        if (field.type === "number") {
          const n = Number(raw);
          if (n < field.min || n > field.max) throw new Error(`${field.label} should be between ${field.min} and ${field.max}.`);
          return raw;
        }
        return raw;
      },
    };
  }

  // Radio, checkbox and weekday choices: a list of tappable options.
  const options =
    field.type === "weekdays" ? Rana.plan.WEEKDAY_ORDER.map((d) => [d, WEEKDAY_NAMES[d]]) : field.options;
  const multiple = field.type !== "radio";
  const name = `edit-${field.key}`;
  const current = p[field.key];
  const list = el("div", "account-options");
  options.forEach(([value, label]) => {
    const row = el("label", "account-option");
    const input = el("input");
    input.type = multiple ? "checkbox" : "radio";
    input.name = name;
    input.value = value;
    input.checked = multiple ? (current || []).includes(value) : current === value;
    row.append(input, ` ${label}`);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return {
    node: wrap,
    focus: () => list.querySelector("input").focus(),
    read() {
      const picked = [...list.querySelectorAll("input:checked")].map((i) => i.value);
      if (field.type === "radio") {
        if (!picked.length) throw new Error("Pick one.");
        return picked[0];
      }
      if (field.type === "weekdays") {
        if (picked.length < 3 || picked.length > 6) throw new Error("Pick 3 to 6 days. (For a different number, build your own plan on the Plan tab.)");
        return picked;
      }
      return picked.length ? picked : ["none"];
    },
  };
}

// Goal or training days changed: work out Rana's new plan, ask, then save.
// Returns false if the user cancelled.
async function applyPlanChange(newProfile) {
  const plan = Rana.storage.getPlan();
  const saved = Rana.storage.getSavedPlans();
  const splitId = Rana.plan.matchSplit(newProfile, data.splits);
  if (!splitId) throw new Error("No plan matches that combination. Try another.");
  const weekdays = newProfile.training_weekdays;
  const weekdayMap = Rana.plan.buildWeekdayMap(data.workoutsBySplit.get(splitId) || [], weekdays);

  const old = saved.rana || { split_id: plan.split_id, weekday_map: plan.weekday_map };
  const unchanged = old.split_id === splitId && JSON.stringify(old.weekday_map) === JSON.stringify(weekdayMap);
  if (unchanged) return true; // nothing about the plan changes

  const ranaActive = (plan.active_plan_id || "rana") === "rana";
  const splitName = data.splitById.get(splitId).split_name.split(" (")[0];
  const when = Rana.plan.switchEffectiveDate() === Rana.plan.todayStr() ? "from today" : "from tomorrow";
  const message = ranaActive
    ? `Rana's plan becomes ${splitName} on ${weekdays.length} days, ${when}. Your workouts and XP stay.`
    : `Rana's plan becomes ${splitName} on ${weekdays.length} days. Your own plan stays active.`;
  const sure = await Rana.ui.confirm({ message, confirmLabel: "Update plan" });
  if (!sure) return false;

  Rana.storage.saveSavedPlan({ plan_id: "rana", kind: "suggested", split_id: splitId, training_weekdays: weekdays, weekday_map: weekdayMap });
  if (ranaActive) {
    Rana.plan.activatePlan("rana"); // keeps the old week in the history
  } else {
    Rana.storage.savePlan({ ...plan, split_id: splitId, training_weekdays: weekdays });
  }
  return true;
}

function renderAnswers() {
  const rows = document.getElementById("answer-rows");
  rows.innerHTML = "";
  FIELDS.forEach((field) => {
    const row = el("div", "account-row");
    const dt = el("dt", null, field.label);
    const dd = el("dd");
    const value = el("span", "account-value", displayValue(field, profile));
    const editBtn = el("button", "btn-quiet btn-quiet--accent account-edit-btn", "Edit");
    editBtn.type = "button";
    editBtn.setAttribute("aria-label", `Edit ${field.label}`);
    dd.append(value, editBtn);
    row.append(dt, dd);
    rows.appendChild(row);

    editBtn.addEventListener("click", () => {
      const editor = buildEditor(field, profile);
      const error = el("p", "status-message status-message--error");
      const actions = el("div", "account-edit-actions");
      const cancel = el("button", "btn-secondary", "Cancel");
      const save = el("button", "btn-continue", "Save");
      cancel.type = save.type = "button";
      actions.append(cancel, save);
      dd.replaceChildren(editor.node, error, actions);
      editor.focus();

      cancel.addEventListener("click", renderAnswers);
      save.addEventListener("click", async () => {
        error.textContent = "";
        try {
          const newValue = editor.read();
          const next = { ...profile, [field.key]: newValue };
          if (field.type === "weekdays") next.training_days_per_week = String(newValue.length);
          if (field.changesPlan && !(await applyPlanChange(next))) return;
          profile = next;
          Rana.storage.saveProfile(profile);
          renderAnswers();
          if (field.key === "name") document.getElementById("char-name").textContent = profile.name;
        } catch (err) {
          error.textContent = err.message;
        }
      });
    });
  });
}

function renderCharacter(plan) {
  const ledger = Rana.game.computeXpLedger(Rana.storage.getFinishedSets(), Rana.storage.getFinishedSessions(), plan, data);
  const level = Rana.game.levelForXp(ledger.totalXp);
  const tier = Rana.game.tierForLevel(level);
  document.getElementById("char-name").textContent = profile.name;
  document.getElementById("char-level").textContent = `LV ${level}`;
  document.getElementById("char-tier").textContent = tier;
  document.getElementById("char-sheet").dataset.tier = tier;
  document.getElementById("char-xp").textContent =
    `${ledger.totalXp.toLocaleString()} XP · ${ledger.sessionsCompleted} ${ledger.sessionsCompleted === 1 ? "session" : "sessions"} · longest streak ${ledger.longestStreak}`;

  const titles = Rana.game.earnedTitles(ledger);
  const list = document.getElementById("char-titles");
  list.innerHTML = "";
  if (!titles.length) {
    list.appendChild(el("li", "account-title account-title--none", "No titles yet. Your first comes with a 10-session streak."));
  }
  titles.forEach((t) => {
    const li = el("li", "account-title");
    li.append(el("span", "account-title-name", t.name), el("span", "account-title-desc", t.description));
    list.appendChild(li);
  });
}

async function main() {
  profile = Rana.storage.getProfile();
  let plan = Rana.storage.getPlan();
  if (!profile || !plan) {
    window.location.href = "onboarding.html";
    return;
  }
  data = await Rana.data.load();
  plan = Rana.storage.getPlan(); // loading the data may have repaired it

  renderCharacter(plan);
  document.getElementById("account-email").textContent = profile.email || "Not saved (signed up before emails were kept)";
  renderAnswers();

  // "Your answers" starts closed; tapping the header opens or closes it.
  const toggle = document.getElementById("answers-toggle");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    document.getElementById("answers-body").hidden = open;
  });
}

main();
