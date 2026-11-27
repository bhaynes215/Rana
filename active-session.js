// Active session / logging (PRD screen 6). Committing to log sets is a
// separate intent from browsing (session-detail.html) — this is the only
// screen that writes logged-set records.
//
// It handles BOTH kinds of workout (added 2026-11-25):
//   - "planned": the suggested workout. One card per prescribed slot, with
//     the prescribed number of set rows, plus swap buttons for the slot's
//     alternatives ("the rack is taken").
//   - "freestyle": the user's own workout. They name it, add any exercise
//     from the library with the picker, and add as many sets as they like.
//
// Opening it with ?date=YYYY-MM-DD starts (or resumes) today's suggested
// workout; ?session=ID resumes any workout by its id. Either way, the
// workout exists as a session record from the moment it starts, so closing
// the tab mid-workout loses nothing: the dashboard shows "Resume".
//
// The slot records what was prescribed; the log records what actually
// happened (PRD section 5.3) — so swapping exercises here doesn't touch
// the slot, it just changes which exercise_key the next logged set uses.

let session = null; // the session record being logged
let data = null;
let profile = null;
let plan = null;

const selectedExerciseKeyBySlot = new Map();

function exerciseOf(key) {
  return data.exerciseByKey.get(key);
}

// ---------------------------------------------------------------------
// A set row: weight, reps, and a Log button. Shared by both workout kinds.
// ---------------------------------------------------------------------
// `existing` is a set already saved for this row (rows are locked once
// logged). `getExerciseKey` says which exercise the row is for right now
// (it can change when a planned slot is swapped). `makeEntry` builds the
// record to save. `onLogged` lets the card react (e.g. hide the remove button).
function buildSetRow({ index, existing, getExerciseKey, makeEntry, onLogged }) {
  const row = document.createElement("div");
  row.className = "set-row";

  const indexEl = document.createElement("span");
  indexEl.className = "set-row-index num";
  indexEl.textContent = index;
  row.appendChild(indexEl);

  // Number-only text boxes: no up/down arrows, nothing but digits (and one
  // decimal point for weight) can be typed. See Rana.ui.numericField.
  const weightInput = Rana.ui.numericField(document.createElement("input"), { decimal: true });
  row.appendChild(weightInput);

  const repsInput = Rana.ui.numericField(document.createElement("input"));
  repsInput.placeholder = "reps";
  row.appendChild(repsInput);

  const logBtn = document.createElement("button");
  logBtn.type = "button";
  logBtn.className = "set-log-btn";
  logBtn.textContent = "Log";
  row.appendChild(logBtn);

  // Bodyweight exercises (pull-ups, dips…) are usually logged with no extra
  // weight, so for those the weight box is optional ("+lb" = added weight).
  function isBodyweight() {
    const ex = exerciseOf(getExerciseKey());
    return Boolean(ex) && ex.equipment === "Bodyweight";
  }
  function refresh() {
    weightInput.placeholder = isBodyweight() ? "+lb" : "lb";
  }
  refresh();
  row.refresh = refresh;

  function lock(weight, reps) {
    weightInput.value = weight;
    repsInput.value = reps;
    weightInput.disabled = true;
    repsInput.disabled = true;
    logBtn.disabled = true;
    logBtn.setAttribute("aria-pressed", "true");
    logBtn.textContent = "Logged";
  }

  if (existing) {
    lock(existing.weight, existing.reps);
  } else {
    logBtn.addEventListener("click", () => {
      const weightMissing = weightInput.value === "" && !isBodyweight();
      const weight = weightInput.value === "" ? 0 : Number(weightInput.value);
      const reps = Number(repsInput.value);
      if (weightMissing || repsInput.value === "" || Number.isNaN(weight) || Number.isNaN(reps) || reps < 1 || weight < 0) {
        logBtn.textContent = "Enter both";
        setTimeout(() => { logBtn.textContent = "Log"; }, 1200);
        return;
      }
      Rana.storage.addLoggedSet({
        ...makeEntry(weight, reps),
        session_id: session.session_id,
        date: session.date,
        set_index: index,
        weight,
        reps,
        completed_at: new Date().toISOString(),
      });
      lock(weight, reps);
      if (onLogged) onLogged();
    });
  }

  return row;
}

// ---------------------------------------------------------------------
// Suggested workout: one card per prescribed slot
// ---------------------------------------------------------------------
function buildSlotCard(slot, pick) {
  const options = data.optionsBySlot.get(slot.slot_id) || [];
  const alreadyLogged = Rana.storage.getSetsForSession(session.session_id).filter((s) => s.slot_id === slot.slot_id);
  const lastLogged = alreadyLogged[alreadyLogged.length - 1];

  // `pick` is the suggested exercise: the main one, unless it loads a joint
  // the user reported a limitation on (limitations only ever shape the
  // suggestion; the swap buttons below always offer every alternative).
  const defaultKey = lastLogged ? lastLogged.exercise_key : pick.exerciseKey;
  selectedExerciseKeyBySlot.set(slot.slot_id, defaultKey);

  const card = document.createElement("div");
  card.className = "panel slot-card";
  card.dataset.slotId = slot.slot_id;

  const pattern = document.createElement("p");
  pattern.className = "slot-pattern";
  pattern.textContent = slot.movement_pattern;
  card.appendChild(pattern);

  const nameEl = document.createElement("h2");
  nameEl.className = "slot-exercise-name";
  card.appendChild(nameEl);

  const cautionEl = document.createElement("p");
  cautionEl.className = "slot-caution";
  card.appendChild(cautionEl);

  const rowEls = [];

  function updateName() {
    const key = selectedExerciseKeyBySlot.get(slot.slot_id);
    const ex = exerciseOf(key);
    nameEl.textContent = ex ? ex.exercise_name : "(unavailable)";
    // The note only applies while the suggested exercise is selected: if the
    // user swaps to something else, that's their choice.
    const isSuggested = key === pick.exerciseKey;
    cautionEl.hidden = !(isSuggested && (pick.caution.length || pick.substituted));
    cautionEl.textContent = pick.caution.length
      ? Rana.plan.cautionText(pick.caution)
      : Rana.plan.swapText(pick, data);
    rowEls.forEach((r) => r.refresh());
  }

  card.appendChild(Rana.ui.prescription(slot));

  // --- Swap picker (every alternative, always) ---
  if (options.length > 1) {
    const swapRow = document.createElement("div");
    swapRow.className = "slot-swap";
    options.forEach((opt) => {
      const ex = exerciseOf(opt.exercise_key);
      if (!ex) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot-swap-option";
      btn.textContent = `${ex.exercise_name} (${ex.equipment})`;
      btn.dataset.exerciseKey = opt.exercise_key;
      btn.setAttribute("aria-pressed", String(opt.exercise_key === defaultKey));
      btn.addEventListener("click", () => {
        selectedExerciseKeyBySlot.set(slot.slot_id, opt.exercise_key);
        swapRow.querySelectorAll(".slot-swap-option").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        updateName();
      });
      swapRow.appendChild(btn);
    });
    card.appendChild(swapRow);
  }

  // --- Set rows: exactly the prescribed number ---
  const rows = document.createElement("div");
  rows.className = "set-rows";
  for (let i = 1; i <= slot.working_sets; i++) {
    const row = buildSetRow({
      index: i,
      existing: alreadyLogged.find((s) => s.set_index === i),
      getExerciseKey: () => selectedExerciseKeyBySlot.get(slot.slot_id),
      makeEntry: () => ({
        slot_id: slot.slot_id,
        exercise_key: selectedExerciseKeyBySlot.get(slot.slot_id),
        rep_range: slot.rep_range,
      }),
    });
    rowEls.push(row);
    rows.appendChild(row);
  }
  card.appendChild(rows);

  updateName();
  return card;
}

// ---------------------------------------------------------------------
// Freestyle: one card per exercise the user added
// ---------------------------------------------------------------------
function buildFreestyleCard(exerciseKey) {
  const ex = exerciseOf(exerciseKey);
  const logged = Rana.storage
    .getSetsForSession(session.session_id)
    .filter((s) => s.exercise_key === exerciseKey)
    .sort((a, b) => a.set_index - b.set_index);

  const card = document.createElement("div");
  card.className = "panel slot-card";
  card.dataset.exerciseKey = exerciseKey;

  const top = document.createElement("div");
  top.className = "freestyle-card-top";
  const pattern = document.createElement("p");
  pattern.className = "slot-pattern";
  pattern.textContent = ex ? `${ex.muscle_group} · ${ex.equipment}` : "";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-quiet";
  removeBtn.textContent = "Remove";
  removeBtn.setAttribute("aria-label", `Remove ${ex ? ex.exercise_name : "exercise"}`);
  // An exercise with logged sets can't be removed (those sets are real).
  removeBtn.hidden = logged.length > 0;
  top.append(pattern, removeBtn);
  card.appendChild(top);

  const nameEl = document.createElement("h2");
  nameEl.className = "slot-exercise-name";
  nameEl.textContent = ex ? ex.exercise_name : exerciseKey;
  card.appendChild(nameEl);

  const rows = document.createElement("div");
  rows.className = "set-rows";
  card.appendChild(rows);

  function addRow(existing) {
    const index = rows.children.length + 1;
    rows.appendChild(
      buildSetRow({
        index,
        existing,
        getExerciseKey: () => exerciseKey,
        makeEntry: () => ({ slot_id: null, exercise_key: exerciseKey, rep_range: null }),
        onLogged: () => { removeBtn.hidden = true; },
      })
    );
  }

  // Locked rows for sets already saved; otherwise start with one empty row.
  logged.forEach((s) => addRow(s));
  if (logged.length === 0) addRow(null);

  const addSetBtn = document.createElement("button");
  addSetBtn.type = "button";
  addSetBtn.className = "btn-secondary add-set-btn";
  addSetBtn.textContent = "+ Add set";
  addSetBtn.addEventListener("click", () => addRow(null));
  card.appendChild(addSetBtn);

  removeBtn.addEventListener("click", () => {
    session = Rana.storage.updateSession(session.session_id, {
      exercises: session.exercises.filter((k) => k !== exerciseKey),
    });
    card.remove();
    refreshFreestyleEmptyState();
  });

  return card;
}

// Called whenever exercises are added or removed. Freestyle: show the
// "add your first exercise" note when empty. Suggested workout: update the
// abs chooser so added exercises show as picked.
function refreshFreestyleEmptyState() {
  if (session.type === "freestyle") {
    document.getElementById("empty-note").hidden = session.exercises.length > 0;
  } else if (refreshAbsChooser) {
    refreshAbsChooser();
  }
}

// ---------------------------------------------------------------------
// Suggested workout: the optional abs section at the end
// ---------------------------------------------------------------------
// Every core exercise is offered (minus any the workout already uses). Tap
// one to add it; it then logs exactly like a freestyle exercise: any number
// of sets, removable until a set is logged. Its sets have no slot, so they
// earn strength XP but never count toward finishing the suggested workout.
let refreshAbsChooser = null;

function buildAbsSection(slots) {
  const options = Rana.plan.absOptions(data, slots);
  const section = document.createElement("div");
  section.className = "abs-section";
  if (!options.length) return section;

  const panel = document.createElement("div");
  panel.className = "panel slot-card abs-panel";
  const eyebrow = document.createElement("p");
  eyebrow.className = "slot-pattern";
  eyebrow.textContent = "Abs · Optional, recommended";
  const hint = document.createElement("p");
  hint.className = "slot-prescription";
  hint.textContent = `${Rana.plan.ABS_HINT}. Tap any to add it.`;
  const chooser = document.createElement("div");
  chooser.className = "slot-swap";
  panel.append(eyebrow, hint, chooser);

  const added = document.createElement("div");
  added.className = "abs-added";
  section.append(panel, added);

  options.forEach((ex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-swap-option";
    btn.textContent = ex.exercise_name;
    btn.dataset.exerciseKey = ex.exercise_key;
    btn.addEventListener("click", () => {
      if (session.exercises.includes(ex.exercise_key)) return; // already added: use its Remove button
      session = Rana.storage.updateSession(session.session_id, {
        exercises: [...session.exercises, ex.exercise_key],
      });
      added.appendChild(buildFreestyleCard(ex.exercise_key));
      refreshAbsChooser();
    });
    chooser.appendChild(btn);
  });

  refreshAbsChooser = () => {
    chooser.querySelectorAll(".slot-swap-option").forEach((b) => {
      b.setAttribute("aria-pressed", String(session.exercises.includes(b.dataset.exerciseKey)));
    });
  };

  session.exercises.forEach((k) => added.appendChild(buildFreestyleCard(k)));
  refreshAbsChooser();
  return section;
}

function openPicker() {
  Rana.picker.open({
    data,
    addedKeys: new Set(session.exercises),
    onAdd: (keys) => {
      const fresh = keys.filter((k) => !session.exercises.includes(k));
      session = Rana.storage.updateSession(session.session_id, { exercises: [...session.exercises, ...fresh] });
      const list = document.getElementById("slot-list");
      fresh.forEach((k) => list.appendChild(buildFreestyleCard(k)));
      refreshFreestyleEmptyState();
    },
  });
}

// ---------------------------------------------------------------------
// Which workout is this page for?
// ---------------------------------------------------------------------
// ?session=ID resumes a specific workout. ?date=YYYY-MM-DD starts (or
// resumes) the suggested workout for that day. Only one workout can be in
// progress at a time, so if a different one already is, go to that one.
function resolveSession() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");
  if (sessionId) return Rana.storage.getSession(sessionId);

  const dateStr = params.get("date") || Rana.plan.todayStr();
  const inProgress = Rana.storage.getInProgressSession();
  if (inProgress) {
    if (inProgress.type === "planned" && inProgress.date === dateStr) return inProgress;
    window.location.replace(`active-session.html?session=${inProgress.session_id}`);
    return undefined;
  }

  // Start the suggested workout, but only for today, and only if it hasn't
  // already been done.
  const finishedForDay = Rana.storage.getFinishedSessions().filter((s) => s.date === dateStr);
  const scheduled = Rana.plan.getSessionForDate(dateStr, plan, data, finishedForDay);
  if (scheduled.isRestDay || scheduled.status === "completed" || dateStr !== Rana.plan.todayStr()) return null;

  return Rana.storage.startSession({
    type: "planned",
    title: scheduled.workout.day_name,
    workout_id: scheduled.workoutId,
    date: dateStr,
  });
}

async function main() {
  profile = Rana.storage.getProfile();
  plan = Rana.storage.getPlan();
  if (!profile || !plan || plan.status !== "active") {
    window.location.href = "dashboard.html";
    return;
  }

  data = await Rana.data.load();
  // Re-read: loading the data may have repaired a plan whose split was removed.
  plan = Rana.storage.getPlan();
  session = resolveSession();
  if (session === undefined) return; // redirecting to the workout already in progress
  if (!session) {
    window.location.href = "dashboard.html";
    return;
  }
  if (session.finished_at) {
    window.location.replace(`session-complete.html?session=${session.session_id}`);
    return;
  }
  // Keep the address in step with the workout, so a reload resumes it.
  window.history.replaceState(null, "", `active-session.html?session=${session.session_id}`);

  const isFreestyle = session.type === "freestyle";
  if (!session.exercises) session.exercises = []; // older records
  document.getElementById("session-title").textContent = Rana.plan.sessionTitle(session, data);
  document.getElementById("session-eyebrow").textContent = isFreestyle ? "Logging · Freestyle" : "Logging · Suggested workout";

  const list = document.getElementById("slot-list");
  list.innerHTML = "";
  if (isFreestyle) {
    session.exercises.forEach((k) => list.appendChild(buildFreestyleCard(k)));
    document.getElementById("add-exercises-btn").hidden = false;
    document.getElementById("add-exercises-btn").addEventListener("click", openPicker);
    refreshFreestyleEmptyState();
  } else {
    const slots = data.slotsByWorkout.get(session.workout_id) || [];
    const picks = Rana.plan.suggestWorkout(slots, data, Rana.plan.activeLimitations(profile));
    slots.forEach((slot, i) => list.appendChild(buildSlotCard(slot, picks[i])));
    list.appendChild(buildAbsSection(slots));
  }

  // --- Discard: deletes the workout and its sets, no XP ---
  document.getElementById("discard-btn").addEventListener("click", async () => {
    const sure = await Rana.ui.confirm({
      message: "Discard this workout? Its sets are deleted and earn no XP. This can't be undone.",
      confirmLabel: "Discard",
    });
    if (sure) {
      Rana.storage.discardSession(session.session_id);
      window.location.href = "dashboard.html";
    }
  });

  // --- Finish ---
  const finishNote = document.getElementById("finish-note");
  document.getElementById("finish-btn").addEventListener("click", async () => {
    finishNote.textContent = "";
    const sets = Rana.storage.getSetsForSession(session.session_id);

    if (sets.length === 0) {
      finishNote.textContent = "Log at least one set before finishing, or discard this workout.";
      return;
    }

    if (isFreestyle) {
      const min = Rana.game.XP_RULES.FREESTYLE_MIN_SETS;
      if (sets.length < min &&
          !(await Rana.ui.confirm({ message: `Log at least ${min} sets to earn session XP. Finish anyway?`, confirmLabel: "Finish anyway" }))) return;
    } else {
      // Following the plan means at least half the prescribed sets.
      const slots = data.slotsByWorkout.get(session.workout_id) || [];
      const prescribed = slots.reduce((sum, s) => sum + s.working_sets, 0);
      const credited = slots.reduce(
        (sum, slot) => sum + Math.min(sets.filter((s) => s.slot_id === slot.slot_id).length, slot.working_sets), 0);
      if (credited / prescribed < Rana.game.XP_RULES.COMPLETION_THRESHOLD &&
          !(await Rana.ui.confirm({ message: "That's under half of the suggested workout, so it won't count as following the plan. Finish anyway?", confirmLabel: "Finish anyway" }))) return;
    }

    const panel = document.getElementById("difficulty-panel");
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.querySelectorAll("[data-difficulty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      Rana.storage.finishSession(session.session_id, Number(btn.dataset.difficulty));
      window.location.href = `session-complete.html?session=${session.session_id}`;
    });
  });
}

main();
