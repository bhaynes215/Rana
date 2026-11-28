// The Plan tab: two cards, Rana's suggested plan and the user's own (or a
// "Build your own plan" card if they haven't made one). The active plan gets
// an ACTIVE tag; the other gets "Set active".
//
// Switching is safe for past XP: Rana.plan.activatePlan keeps the old week in
// plan.schedule_history, so days before the switch are still judged against
// the plan that was active then (see plan.js, scheduleFor).

// "from today" or "from tomorrow", for the confirm box and the note.
function whenText(dateStr) {
  return dateStr === Rana.plan.todayStr() ? "from today" : "from tomorrow (you've already trained today)";
}

async function main() {
  const profile = Rana.storage.getProfile();
  let plan = Rana.storage.getPlan();
  if (!profile || !plan) {
    window.location.href = "onboarding.html";
    return;
  }
  if (plan.status !== "active") {
    window.location.href = "results.html"; // not locked in yet
    return;
  }

  const data = await Rana.data.load();
  plan = Rana.storage.getPlan(); // loading the data may have repaired it
  const saved = Rana.storage.getSavedPlans();
  const activeId = plan.active_plan_id || "rana";

  // --- Rana's plan ---
  const ranaCard = document.getElementById("rana-card");
  if (saved.rana) {
    const summary = Rana.planView.ranaSummary(saved.rana, data, profile);
    document.getElementById("rana-name").textContent = summary.name;
    document.getElementById("rana-meta").textContent = summary.meta;
    Rana.planView.renderWeek(document.getElementById("rana-week"), {
      weekdayMap: saved.rana.weekday_map, data, profile, expandable: true,
    });
  }

  // --- The user's own plan, or the card that offers to build one ---
  const ownCard = document.getElementById("own-card");
  if (saved.own) {
    ownCard.hidden = false;
    const summary = Rana.planView.ownSummary(saved.own);
    document.getElementById("own-name").textContent = summary.name;
    document.getElementById("own-meta").textContent = summary.meta;
    Rana.planView.renderWeek(document.getElementById("own-week"), {
      weekdayMap: saved.own.weekday_map, ownDayNames: saved.own.own_day_names, data, profile,
    });
  } else {
    document.getElementById("build-card").hidden = false;
  }

  // --- Active tag / Set active ---
  [["rana", ranaCard], ["own", ownCard]].forEach(([id, card]) => {
    const isActive = id === activeId;
    card.classList.toggle("plan-card--active", isActive);
    card.querySelector(".plan-card-active").hidden = !isActive;
    card.querySelector(".plan-card-activate").hidden = isActive;
  });

  document.querySelectorAll(".plan-card-activate").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.plan;
      const name = id === "rana" ? "Rana's plan" : "your plan";
      const sure = await Rana.ui.confirm({
        message: `Switch to ${name}? Your dashboard follows it ${whenText(Rana.plan.switchEffectiveDate())}. Your workouts and XP stay.`,
        confirmLabel: "Set active",
      });
      if (!sure) return;
      const result = Rana.plan.activatePlan(id);
      const query = result && result.effectiveFrom && result.effectiveFrom !== Rana.plan.todayStr() ? "?switched=tomorrow" : "";
      window.location.href = `my-plan.html${query}`;
    });
  });

  // A switch made after training today starts tomorrow: say so.
  if (new URLSearchParams(window.location.search).get("switched") === "tomorrow") {
    const note = document.getElementById("switch-note");
    note.hidden = false;
    note.textContent = "You already trained today, so the new plan starts tomorrow.";
  }

  // --- Delete the own plan (only while it isn't active) ---
  // An active plan can't be deleted: the dashboard needs a plan to follow.
  const deleteBtn = document.getElementById("delete-own-btn");
  deleteBtn.hidden = activeId === "own";
  deleteBtn.addEventListener("click", async () => {
    const sure = await Rana.ui.confirm({
      message: "Delete your plan? Workouts you already logged with it stay in your history.",
      confirmLabel: "Delete",
    });
    if (!sure) return;
    Rana.storage.deleteSavedPlan("own");
    window.location.reload();
  });
}

main();
