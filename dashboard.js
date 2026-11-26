// Dashboard, rebuilt against design/rana-dashboard-mockup.html (PRD §7, §10).
// Renders from Rana.dashboard.getDashboardState() (js/dashboard-state.js),
// which assembles everything into one plain object shaped for rendering.
// The only direct storage calls here are the user's own actions: starting a
// freestyle workout and discarding one. (Rana.plan.todayStr() is a pure
// date-formatting helper, not a data read.)

const SEGMENTS = 20; // verified legible at 390px — see CLAUDE.md if that changes

function renderSegments(container, filledCount, total = SEGMENTS) {
  container.innerHTML = "";
  const clamped = Math.max(0, Math.min(total, Math.round(filledCount)));
  for (let i = 0; i < total; i++) {
    const span = document.createElement("span");
    if (i < clamped) span.classList.add("filled");
    container.appendChild(span);
  }
}

function segmentsFor(value, max) {
  if (!max) return 0;
  return (value / max) * SEGMENTS;
}

async function main() {
  const state = await Rana.dashboard.getDashboardState();

  // --- Vitals bar (persistent chrome, pinned via CSS position: sticky) ---
  document.getElementById("vitals-name").textContent = state.name;
  document.getElementById("vitals-tier").textContent = state.tier;
  document.getElementById("level-text").textContent = `LV ${state.level}`;

  // Tier glow: styles.css gives each tier its own glow color, keyed off
  // this data-tier attribute, so the color changes as you tier up.
  document.querySelector(".vitals-id").dataset.tier = state.tier;

  // Earned title (e.g. "The Unbroken") under the name, only once earned.
  const titleEl = document.getElementById("vitals-title");
  titleEl.textContent = state.title || "";
  titleEl.hidden = !state.title;

  // XP progress through the current level, not lifetime totals.
  document.getElementById("xp-text").textContent =
    `${state.xpIntoLevel} / ${state.xpLevelSpan} XP TO LV ${state.level + 1}`;
  renderSegments(document.getElementById("xp-bar"), segmentsFor(state.xpIntoLevel, state.xpLevelSpan));

  const recoveryText = document.getElementById("recovery-text");
  const recoveryBar = document.getElementById("recovery-bar");
  if (state.recovery === null) {
    // Never a placeholder percentage, never 100%, never a guess.
    recoveryText.textContent = "— NO DATA";
    recoveryText.classList.add("vitals-meter-value--dash");
    renderSegments(recoveryBar, 0);
  } else {
    recoveryText.textContent = `${state.recovery}%`;
    recoveryText.classList.remove("vitals-meter-value--dash");
    recoveryBar.classList.add("stat-bar--recovery");
    renderSegments(recoveryBar, segmentsFor(state.recovery, 100));
  }

  // --- Workout in progress (or left over from an earlier day) ---
  // Only one workout can be in progress at a time, so while one is, the
  // start buttons are hidden and this banner is the way back in.
  const busy = Boolean(state.inProgress);
  const banner = document.getElementById("resume-banner");
  if (busy) {
    const ip = state.inProgress;
    banner.hidden = false;
    document.getElementById("resume-label").textContent = ip.isFromEarlierDay
      ? "You didn't finish this workout"
      : "Workout in progress";
    document.getElementById("resume-title").textContent = ip.isFromEarlierDay
      ? `${ip.title} · ${new Date(ip.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
      : ip.title;
    const resumeBtn = document.getElementById("resume-btn");
    resumeBtn.textContent = ip.isFromEarlierDay ? "Finish it" : "Resume";
    resumeBtn.addEventListener("click", () => {
      window.location.href = `active-session.html?session=${ip.sessionId}`;
    });
    document.getElementById("discard-btn").addEventListener("click", () => {
      if (window.confirm(`Discard "${ip.title}"? Its sets are deleted and earn no XP. This can't be undone.`)) {
        Rana.storage.discardSession(ip.sessionId);
        window.location.reload();
      }
    });
  }

  // --- Session card: today's SUGGESTED workout ---
  // The plan is a suggestion, not a rule (2026-11-25): on a rest day there's
  // still a way to train, and on a training day there's a way to do
  // something else. Following the plan is rewarded through the streak boost,
  // not enforced.
  const today = state.today;
  const cta = document.getElementById("session-cta");
  const restNote = document.getElementById("rest-note");
  const sessionMeta = document.getElementById("session-meta");
  const sessionYield = document.getElementById("session-yield");
  const freestyleBtn = document.getElementById("freestyle-btn");
  const limitationNote = document.getElementById("limitation-note");

  document.getElementById("session-label").textContent = "Today's suggested workout";
  freestyleBtn.hidden = busy;

  if (today.isRestDay) {
    document.getElementById("session-day").textContent = "Rest";
    document.getElementById("session-focus").textContent = "Rest is part of the plan.";
    sessionMeta.hidden = true;
    sessionYield.hidden = true;
    limitationNote.hidden = true;
    restNote.hidden = false;

    // Primary button only appears to look back at a workout already done today.
    cta.hidden = busy || !today.trainedToday;
    if (!cta.hidden) {
      cta.textContent = "View workout summary";
      cta.addEventListener("click", () => {
        window.location.href = `session-complete.html?session=${today.summarySessionId}`;
      });
    }
    freestyleBtn.textContent = today.trainedToday ? "Start another workout" : "Start a workout anyway";

    fetch("data/quotes.json")
      .then((r) => r.json())
      .then((quotes) => {
        const restQuotes = quotes.filter((q) => q.context.includes("rest"));
        const quote = restQuotes[Math.floor(Math.random() * restQuotes.length)];
        restNote.textContent = `"${quote.text}" — ${quote.author}`;
      })
      .catch(() => {
        restNote.textContent = "Rest days are part of the plan.";
      });
  } else {
    document.getElementById("session-day").textContent = today.dayName;
    document.getElementById("session-focus").textContent = today.focusMuscles;
    document.getElementById("meta-slots").textContent = today.slotCount;
    document.getElementById("meta-sets").textContent = today.workingSets;
    document.getElementById("meta-time").textContent = `${today.estMinutes}m`;
    restNote.hidden = true;

    limitationNote.hidden = !today.limitationNote;
    limitationNote.textContent = today.limitationNote || "";

    const chipsEl = document.getElementById("yield-chips");
    chipsEl.innerHTML = "";
    today.statYield.forEach((stat) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `+${stat}`;
      chipsEl.appendChild(chip);
    });

    cta.hidden = busy;
    if (today.completed) {
      cta.textContent = "View summary";
      cta.addEventListener("click", () => {
        window.location.href = `session-complete.html?session=${today.summarySessionId}`;
      });
      freestyleBtn.textContent = "Start another workout";
    } else {
      cta.textContent = "Start session";
      cta.addEventListener("click", () => {
        window.location.href = `session-detail.html?date=${Rana.plan.todayStr()}`;
      });
      freestyleBtn.textContent = "Do something else";
    }
  }

  // --- Freestyle: name it, then go straight to logging ---
  const nameBackdrop = document.getElementById("name-backdrop");
  const nameInput = document.getElementById("name-input");

  function defaultWorkoutName() {
    const d = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return `Freestyle · ${d}`;
  }
  function closeNameModal() {
    nameBackdrop.hidden = true;
    freestyleBtn.focus();
  }
  freestyleBtn.addEventListener("click", () => {
    nameInput.value = defaultWorkoutName();
    nameBackdrop.hidden = false;
    nameInput.focus();
    nameInput.select();
  });
  document.getElementById("name-cancel").addEventListener("click", closeNameModal);
  nameBackdrop.addEventListener("click", (event) => {
    if (event.target === nameBackdrop) closeNameModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !nameBackdrop.hidden) closeNameModal();
  });
  document.getElementById("name-form").addEventListener("submit", (event) => {
    event.preventDefault();
    // If a workout was started in another tab meanwhile, resume it instead
    // of creating a second one — only one can be in progress.
    const existing = Rana.storage.getInProgressSession();
    const session =
      existing ||
      Rana.storage.startSession({
        type: "freestyle",
        title: nameInput.value.trim() || defaultWorkoutName(),
        date: Rana.plan.todayStr(),
      });
    window.location.href = `active-session.html?session=${session.session_id}`;
  });

  // --- Status matrix: current vs. 12-week target, not progress to next level ---
  const statRows = document.getElementById("stat-rows");
  statRows.innerHTML = "";
  state.stats.forEach((stat) => {
    const row = document.createElement("div");
    row.className = "stat-matrix-row";

    const head = document.createElement("div");
    head.className = "stat-matrix-head";
    head.innerHTML =
      `<span class="stat-matrix-name">${stat.key}</span>` +
      `<span class="stat-matrix-values"><span class="num">${stat.current}</span>` +
      `<span class="stat-matrix-arrow">&rarr;</span>` +
      `<span class="num stat-matrix-target">${stat.target}</span></span>`;
    row.appendChild(head);

    const bar = document.createElement("div");
    bar.className = "stat-bar projected";
    row.appendChild(bar);

    statRows.appendChild(row);
    renderSegments(bar, segmentsFor(stat.current, stat.target));
  });

  // --- Microcycle: one cell shape for all seven days, state via border/marker only ---
  document.getElementById("week-number").textContent = `week ${state.weekNumber}`;
  const weekStrip = document.getElementById("week-strip");
  weekStrip.innerHTML = "";
  state.week.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "microcycle-day";
    cell.dataset.state = day.state;
    cell.innerHTML =
      `<span class="microcycle-day-name">${day.weekday}</span>` +
      `<span class="microcycle-day-marker"></span>` +
      `<span class="microcycle-day-label">${day.state === "rest" ? "REST" : day.label}</span>`;
    weekStrip.appendChild(cell);
  });

  // --- Footer ---
  document.getElementById("footer-consistency").textContent =
    `${state.streak} ${state.streak === 1 ? "session" : "sessions"}`;
  document.getElementById("footer-logged").textContent = state.sessionsLogged;
  document.getElementById("footer-next").textContent = state.nextTier;
}

main();
