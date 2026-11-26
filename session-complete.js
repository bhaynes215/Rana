// Session complete (PRD screen 7): the workout summary and the game-style
// XP reveal.
//
// How it works: it runs the XP ledger twice — once over your whole history,
// and once over your history WITHOUT this workout. The difference is what
// this workout earned. Comparing the two also tells us whether you crossed
// a level, a tier, or earned a new title. Nothing is stored; see the design
// note at the top of game.js.
//
// The reveal is a list of "steps" (a line lands, the bar fills, a card
// appears), run one after another on timers. Tapping anywhere runs all the
// remaining steps at once; reduced-motion users skip straight to the end.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SEGMENTS = 20;

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function exerciseName(data, key) {
  const ex = data.exerciseByKey.get(key);
  return ex ? ex.exercise_name : key;
}

// "+2.8%" for weighted lifts; "+25% reps" for bodyweight ones, since those
// are compared by reps rather than by an estimated max.
function formatIncrease(increase) {
  const pct = `+${increase.percent.toFixed(1)}%`;
  return increase.mode === "bodyweight" ? `${pct} reps` : pct;
}

function formatSet(set) {
  const reps = Number(set.reps);
  return Number(set.weight) > 0 ? `${set.weight} × ${reps}` : `${reps} reps`;
}

function formatDuration(session) {
  const minutes = Math.round((new Date(session.finished_at) - new Date(session.started_at)) / 60000);
  return minutes < 1 ? "under a minute" : `${minutes} min`;
}

// ---------------------------------------------------------------------
// What the "XP gained" panel will show, as a list of lines
// ---------------------------------------------------------------------
// kind: "increase" | "record" | "session" | "combo" | "note"
// A "record" is a strength gain at or above NEW_RECORD_PERCENT; hitting
// the per-exercise cap adds a MAX GAIN badge. Small gains land quietly.
// Lines are ordered so the biggest strength gain comes last, for drama.
function buildLines(session, after, data) {
  const rules = Rana.game.XP_RULES;
  const entry = after.entries.get(session.date);
  const sessionEntry = after.sessionEntries.get(session.session_id) || { increases: [] };
  const lines = [];

  [...sessionEntry.increases]
    .sort((a, b) => a.xp - b.xp)
    .forEach((inc) => {
      const isRecord = inc.percent >= rules.NEW_RECORD_PERCENT;
      lines.push({
        kind: isRecord ? "record" : "increase",
        label: exerciseName(data, inc.exerciseKey),
        detail: formatIncrease(inc),
        xp: inc.xp,
        isMax: inc.xp >= rules.MAX_XP_PER_EXERCISE,
      });
    });

  const earnedHere = entry && entry.xpSessionId === session.session_id;
  if (earnedHere) {
    lines.push({
      kind: "session",
      label: entry.completed ? "Suggested workout complete" : "Session complete",
      detail: entry.completed ? "" : "off-plan",
      xp: entry.sessionXp,
    });
    if (entry.completed && entry.streakBonusXp > 0) {
      lines.push({
        kind: "combo",
        label: `ADHERENCE ×${entry.streakMultiplier.toFixed(2)}`,
        detail: `${entry.streak} in a row`,
        xp: entry.streakBonusXp,
      });
    }
    if (entry.offPlan) {
      lines.push({ kind: "note", label: "Off-plan workout: your streak is held, not grown." });
    }
  } else if (entry && entry.xpSessionId) {
    lines.push({ kind: "note", label: "Today's session XP was already earned by another workout." });
  } else if (entry && entry.restDay) {
    lines.push({ kind: "note", label: "Rest-day workout: strength gains only. Rest is part of the plan." });
  } else if (session.type === "planned") {
    lines.push({ kind: "note", label: "Under half the suggested workout was logged, so it didn't count as following the plan." });
  } else {
    lines.push({ kind: "note", label: `Log at least ${rules.FREESTYLE_MIN_SETS} sets to earn session XP.` });
  }

  return lines;
}

// ---------------------------------------------------------------------
// The "what powered this" line for the level-up / tier-up cards
// ---------------------------------------------------------------------
function poweredByLine(lines) {
  const parts = [];
  const top = lines.filter((l) => l.kind === "record" || l.kind === "increase").sort((a, b) => b.xp - a.xp)[0];
  if (top) parts.push(`${top.label} ${top.detail}`);
  const combo = lines.find((l) => l.kind === "combo");
  if (combo) parts.push(`${combo.detail} streak`);
  if (!parts.length && lines.some((l) => l.kind === "session")) parts.push("Showing up");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------
// The workout recap: every exercise and its sets
// ---------------------------------------------------------------------
function buildRecap(session, sets, after, data) {
  const sessionEntry = after.sessionEntries.get(session.session_id) || { increases: [] };
  const increaseByExercise = new Map(sessionEntry.increases.map((i) => [i.exerciseKey, i]));

  document.getElementById("recap-kind").textContent =
    `${session.type === "planned" ? "Suggested workout" : "Freestyle"} · ` +
    new Date(session.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  document.getElementById("recap-title").textContent = Rana.plan.sessionTitle(session, data);

  const byExercise = new Map();
  [...sets].sort((a, b) => a.set_index - b.set_index).forEach((s) => {
    const list = byExercise.get(s.exercise_key) || [];
    list.push(s);
    byExercise.set(s.exercise_key, list);
  });
  document.getElementById("recap-meta").textContent =
    `${formatDuration(session)} · ${byExercise.size} exercise${byExercise.size === 1 ? "" : "s"} · ${sets.length} set${sets.length === 1 ? "" : "s"}`;

  const list = document.getElementById("recap-exercises");
  list.innerHTML = "";
  byExercise.forEach((exSets, key) => {
    const inc = increaseByExercise.get(key);
    const li = el("li", "recap-exercise");

    const head = el("div", "recap-exercise-head");
    head.appendChild(el("span", "recap-exercise-name", exerciseName(data, key)));
    if (inc) head.appendChild(el("span", "recap-best-tag", "NEW BEST"));
    li.appendChild(head);

    const chips = el("div", "recap-sets");
    let starred = false;
    exSets.forEach((s) => {
      // Star the one set that earned the strength increase.
      const isBest = inc && !starred && Number(s.weight) === inc.bestSet.weight && Number(s.reps) === inc.bestSet.reps;
      if (isBest) starred = true;
      chips.appendChild(el("span", isBest ? "recap-set recap-set--best num" : "recap-set num", `${isBest ? "★ " : ""}${formatSet(s)}`));
    });
    li.appendChild(chips);
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// The XP reveal
// ---------------------------------------------------------------------
let timers = [];
let stepIndex = 0;
let steps = [];
let displayedXp = 0;
let countTimer = null;

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

// Counts the big "+N XP" number up to `target` (or jumps there instantly).
function setTotal(target, instant) {
  const totalEl = document.getElementById("xp-total");
  clearInterval(countTimer);
  const from = displayedXp;
  displayedXp = target;
  if (instant || reduceMotion) {
    totalEl.textContent = `+${target} XP`;
    return;
  }
  let tick = 0;
  const TICKS = 14;
  countTimer = setInterval(() => {
    tick += 1;
    totalEl.textContent = `+${Math.round(from + ((target - from) * tick) / TICKS)} XP`;
    if (tick >= TICKS) clearInterval(countTimer);
  }, 22);
  totalEl.animate([{ transform: "scale(1.22)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
}

function flashPanel() {
  if (reduceMotion) return;
  document.getElementById("xp-panel").animate(
    [
      { boxShadow: "0 0 0 rgba(63, 233, 255, 0)" },
      { boxShadow: "0 0 44px rgba(63, 233, 255, 0.65)" },
      { boxShadow: "0 0 0 rgba(63, 233, 255, 0)" },
    ],
    { duration: 800, easing: "ease-out" }
  );
}

function showLine(line, instant) {
  const li = el("li", `xp-line xp-line--${line.kind}`);
  if (instant || reduceMotion) li.style.animation = "none";

  const label = el("span", "xp-line-label");
  label.appendChild(el("span", "xp-line-name", line.label));
  if (line.detail) label.appendChild(el("span", "xp-line-detail", line.detail));
  if (line.kind === "record") {
    const badge = el("span", "xp-badge xp-badge--record", "NEW RECORD");
    if (instant || reduceMotion) badge.style.animation = "none";
    label.appendChild(badge);
  }
  if (line.isMax) {
    const badge = el("span", "xp-badge xp-badge--max", "MAX GAIN");
    if (instant || reduceMotion) badge.style.animation = "none";
    label.appendChild(badge);
  }
  li.appendChild(label);
  if (line.xp) li.appendChild(el("span", "xp-line-xp num", `+${line.xp}`));
  document.getElementById("xp-lines").appendChild(li);

  if (line.xp) {
    setTotal(displayedXp + line.xp, instant);
    if (!instant && line.kind === "record") flashPanel();
  }
}

// --- The level bar: segmented, like the dashboard's ---
function renderBar(filled) {
  const bar = document.getElementById("xp-bar");
  if (!bar.children.length) {
    for (let i = 0; i < SEGMENTS; i++) bar.appendChild(document.createElement("span"));
  }
  [...bar.children].forEach((seg, i) => seg.classList.toggle("filled", i < filled));
}

function setLevelText(level, intoLevel, span) {
  document.getElementById("xp-level-label").textContent = `LV ${level}`;
  document.getElementById("xp-level-progress").textContent = `${Math.round(intoLevel)} / ${span} XP`;
}

// Where the bar sits for a given total XP.
function barState(totalXp) {
  const level = Rana.game.levelForXp(totalXp);
  const start = Rana.game.xpForLevel(level);
  const span = Rana.game.xpForLevel(level + 1) - start;
  return { level, into: totalXp - start, span, filled: Math.round(((totalXp - start) / span) * SEGMENTS) };
}

// Fills the bar from the "before" state to the "after" state. If a level
// was crossed, it fills to full first, then restarts for the new level.
// Returns how long the animation takes, so the next step can wait for it.
function fillBar(beforeState, afterState, instant) {
  if (instant || reduceMotion) {
    renderBar(afterState.filled);
    setLevelText(afterState.level, afterState.into, afterState.span);
    return 0;
  }
  const SEG_MS = 38;
  let t = 0;
  const climb = (from, to, offset) => {
    for (let k = from + 1; k <= to; k++) {
      later(() => renderBar(k), offset + (k - from) * SEG_MS);
    }
    return (to - from) * SEG_MS;
  };

  if (afterState.level === beforeState.level) {
    t = climb(beforeState.filled, afterState.filled, 0);
    later(() => setLevelText(afterState.level, afterState.into, afterState.span), t);
  } else {
    t = climb(beforeState.filled, SEGMENTS, 0);
    later(() => {
      renderBar(0);
      setLevelText(afterState.level, afterState.into, afterState.span);
    }, t + 250);
    t += 250 + climb(0, afterState.filled, t + 250);
  }
  return t;
}

// --- Run the steps ---
function runFrom(i) {
  stepIndex = i;
  if (i >= steps.length) return;
  const delay = steps[i].run(false);
  later(() => runFrom(i + 1), delay);
}

function skipReveal() {
  timers.forEach(clearTimeout);
  timers = [];
  for (let i = stepIndex; i < steps.length; i++) steps[i].run(true);
  stepIndex = steps.length;
}

// ---------------------------------------------------------------------
async function main() {
  const profile = Rana.storage.getProfile();
  const plan = Rana.storage.getPlan();
  if (!profile || !plan) {
    window.location.href = "dashboard.html";
    return;
  }

  const data = await Rana.data.load();

  // Which workout? ?session=ID, or (older links) the latest one that day.
  const params = new URLSearchParams(window.location.search);
  let session = params.get("session") ? Rana.storage.getSession(params.get("session")) : null;
  if (!session && params.get("date")) {
    const onDate = Rana.storage.getFinishedSessions().filter((s) => s.date === params.get("date"));
    session = onDate[onDate.length - 1] || null;
  }
  if (!session) {
    window.location.href = "dashboard.html";
    return;
  }
  if (!session.finished_at) {
    window.location.replace(`active-session.html?session=${session.session_id}`);
    return;
  }

  // --- The ledger, with and without this workout ---
  const allSessions = Rana.storage.getFinishedSessions();
  const allSets = Rana.storage.getFinishedSets();
  const after = Rana.game.computeXpLedger(allSets, allSessions, plan, data);
  const without = Rana.game.computeXpLedger(
    allSets.filter((s) => s.session_id !== session.session_id),
    allSessions.filter((s) => s.session_id !== session.session_id),
    plan,
    data
  );
  const gained = after.totalXp - without.totalXp;

  const sessionSets = allSets.filter((s) => s.session_id === session.session_id);
  buildRecap(session, sessionSets, after, data);

  // --- The XP panel, starting at the "before" state ---
  const lines = buildLines(session, after, data);
  const beforeBar = barState(without.totalXp);
  const afterBar = barState(after.totalXp);
  renderBar(beforeBar.filled);
  setLevelText(beforeBar.level, beforeBar.into, beforeBar.span);

  // --- New title earned this session? ---
  const titlesBefore = new Set(Rana.game.earnedTitles(without).map((t) => t.name));
  const newTitles = Rana.game.earnedTitles(after).filter((t) => !titlesBefore.has(t.name));

  // --- Stat gains (everyone starts at 0; stats only come from logged work) ---
  const pointsBefore = Rana.game.computeStatPoints(
    allSets.filter((s) => s.session_id !== session.session_id), data.exerciseByKey, without.plannedSessionsCompleted);
  const pointsAfter = Rana.game.computeStatPoints(allSets, data.exerciseByKey, after.plannedSessionsCompleted);
  const statGainsEl = document.getElementById("stat-gains");
  statGainsEl.innerHTML = "";
  ["STR", "AGI", "VIT", "INT"].forEach((stat) => {
    const statBefore = Rana.game.statValue(pointsBefore[stat]);
    const statAfter = Rana.game.statValue(pointsAfter[stat]);
    const row = document.createElement("p");
    row.className = "slot-prescription";
    const delta = statAfter - statBefore;
    row.innerHTML = `${stat}: <span class="num">${statBefore}</span> ${delta > 0 ? `&rarr; <span class="num">${statAfter}</span>` : "(no change)"}`;
    statGainsEl.appendChild(row);
  });

  // --- Quote ---
  const quotes = await fetch("data/quotes.json").then((r) => r.json());
  const completeQuotes = quotes.filter((q) => q.context.includes("session-complete"));
  const quote = completeQuotes[Math.floor(Math.random() * completeQuotes.length)];
  document.getElementById("quote-text").textContent = `"${quote.text}"`;
  document.getElementById("quote-attribution").textContent = `— ${quote.author}`;

  // --- Level-up / tier-up title cards ---
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-backdrop").hidden = true;
    });
  });
  const levelBefore = beforeBar.level;
  const levelAfter = afterBar.level;
  const tierBefore = Rana.game.tierForLevel(levelBefore);
  const tierAfter = Rana.game.tierForLevel(levelAfter);
  const powered = poweredByLine(lines);

  function showCards() {
    // Crossing several levels at once shows one card with the final level;
    // a tier-up takes priority over a level-up.
    if (tierAfter !== tierBefore) {
      document.getElementById("tier-up-card").dataset.tier = tierAfter;
      document.getElementById("tier-up-value").textContent = tierAfter;
      document.getElementById("tier-up-level").textContent = `LV ${levelAfter}`;
      document.getElementById("tier-up-powered").textContent = powered;
      document.getElementById("tier-up-backdrop").hidden = false;
    } else if (levelAfter > levelBefore) {
      document.getElementById("level-up-value").textContent = `LV ${levelAfter}`;
      document.getElementById("level-up-powered").textContent = powered;
      document.getElementById("level-up-backdrop").hidden = false;
    }
  }

  // --- The reveal: one step per line, then the bar, then title + cards ---
  steps = [];
  lines.forEach((line) => {
    steps.push({
      run: (instant) => {
        showLine(line, instant);
        return line.kind === "record" ? 1100 : line.kind === "note" ? 500 : 700;
      },
    });
  });
  steps.push({
    run: (instant) => {
      setTotal(gained, instant); // settle on the exact total
      return fillBar(beforeBar, afterBar, instant) + 450;
    },
  });
  steps.push({
    run: () => {
      if (newTitles.length) {
        const t = newTitles[newTitles.length - 1];
        const titleEl = document.getElementById("title-earned");
        titleEl.textContent = `Title earned: ${t.name} — ${t.description}`;
        titleEl.hidden = false;
      }
      showCards();
      return 0;
    },
  });

  document.getElementById("summary-screen").addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return; // don't let skip-on-tap eat real controls
    skipReveal();
  });

  if (reduceMotion) skipReveal();
  else later(() => runFrom(0), 350);
}

main();
