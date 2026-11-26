// Session complete (PRD screen 7) — carries the level-up/tier-up moment.
//
// How it works: it runs the XP ledger twice — once over your whole history,
// and once over your history WITHOUT this session's sets. The difference is
// what this session earned. Comparing the two also tells us whether you
// crossed a level, a tier, or earned a new title. Nothing is stored; see
// the design note at the top of game.js.

function getDateParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("date") || Rana.plan.todayStr();
}

// Formats one line of the XP breakdown list.
function addBreakdownLine(listEl, label, xp) {
  const li = document.createElement("li");
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const xpEl = document.createElement("span");
  xpEl.className = "num";
  xpEl.textContent = `+${xp} XP`;
  li.append(labelEl, xpEl);
  listEl.appendChild(li);
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

// A short "what powered this" line for the level-up / tier-up cards:
// the biggest strength increase and the streak, when there are any.
function poweredByLine(entry, data) {
  const parts = [];
  if (entry.increases.length) {
    const top = [...entry.increases].sort((a, b) => b.xp - a.xp)[0];
    parts.push(`${exerciseName(data, top.exerciseKey)} ${formatIncrease(top)}`);
  }
  if (entry.completed && entry.streak > 1) {
    parts.push(`${entry.streak}-session streak`);
  }
  if (!parts.length && entry.completed) parts.push("Showing up");
  return parts.join(" · ");
}

async function main() {
  const profile = Rana.storage.getProfile();
  const plan = Rana.storage.getPlan();
  if (!profile || !plan) {
    window.location.href = "dashboard.html";
    return;
  }

  const data = await Rana.data.load();
  const dateStr = getDateParam();

  const allSets = Rana.storage.getAllLoggedSets();
  const setsWithoutThisSession = allSets.filter((s) => s.date !== dateStr);

  const after = Rana.game.computeXpLedger(allSets, plan, data);
  const before = Rana.game.computeXpLedger(setsWithoutThisSession, plan, data);
  const gained = after.totalXp - before.totalXp;
  const entry = after.entries.get(dateStr);

  document.getElementById("xp-gain").textContent = `+${gained} XP`;

  // --- XP breakdown: where this session's XP came from ---
  const breakdownEl = document.getElementById("xp-breakdown");
  breakdownEl.innerHTML = "";
  if (entry) {
    entry.increases.forEach((inc) => {
      addBreakdownLine(breakdownEl, `${exerciseName(data, inc.exerciseKey)} ${formatIncrease(inc)}`, inc.xp);
    });
    if (entry.completed) {
      addBreakdownLine(breakdownEl, "Session complete", entry.sessionXp);
      if (entry.streakBonusXp > 0) {
        addBreakdownLine(
          breakdownEl,
          `Streak ×${entry.streakMultiplier.toFixed(2)} (${entry.streak} in a row)`,
          entry.streakBonusXp
        );
      }
    }
  }
  if (entry && !entry.completed) {
    const note = document.createElement("li");
    note.className = "xp-breakdown-note";
    note.textContent = "Log at least half of today's prescribed sets to earn session XP and keep your streak.";
    breakdownEl.appendChild(note);
  }
  if (!breakdownEl.children.length) {
    const note = document.createElement("li");
    note.className = "xp-breakdown-note";
    note.textContent = "No XP this session.";
    breakdownEl.appendChild(note);
  }

  // --- New title earned this session? ---
  const titlesBefore = new Set(Rana.game.earnedTitles(before).map((t) => t.name));
  const newTitles = Rana.game.earnedTitles(after).filter((t) => !titlesBefore.has(t.name));
  if (newTitles.length) {
    const t = newTitles[newTitles.length - 1];
    const el = document.getElementById("title-earned");
    el.textContent = `Title earned: ${t.name} — ${t.description}`;
    el.hidden = false;
  }

  // --- Stat gains (everyone starts at 0; stats only come from logged work) ---
  const pointsBefore = Rana.game.computeStatPoints(setsWithoutThisSession, data.exerciseByKey, before.sessionsCompleted);
  const pointsAfter = Rana.game.computeStatPoints(allSets, data.exerciseByKey, after.sessionsCompleted);

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

  const levelBefore = Rana.game.levelForXp(before.totalXp);
  const levelAfter = Rana.game.levelForXp(after.totalXp);
  const tierBefore = Rana.game.tierForLevel(levelBefore);
  const tierAfter = Rana.game.tierForLevel(levelAfter);
  const powered = entry ? poweredByLine(entry, data) : "";

  // Crossing several levels at once shows one card with the final level.
  // A tier-up replaces the level-up card, since it's the bigger moment.
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

main();
