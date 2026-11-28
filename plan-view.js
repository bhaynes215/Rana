// Draws a plan's week (Mon–Sun) the same way everywhere: the results screen,
// and both cards on the Plan tab. Training days show their workout's name
// (and focus, for Rana's plan); rest days are listed as "Rest", never blank.
//
//   Rana.planView.renderWeek(listEl, { weekdayMap, ownDayNames, data, profile, expandable })
//   Rana.planView.ranaSummary(def, data, profile)  → { name, meta, why }
//   Rana.planView.ownSummary(def)                  → { name, meta }
//
// `expandable: true` (Plan tab) turns each of Rana's training days into a
// button that opens the day's exercises with their sets and reps.

window.Rana = window.Rana || {};

Rana.planView = (() => {
  const FITNESS_LEVEL_LABEL = {
    "never-trained": "New to training",
    "returning": "Returning",
    "consistently": "Training consistently",
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // "Upper / Lower (4-Day)" → "Upper / Lower". The parenthetical repeats
  // the day count or lists the days, which the week list already shows.
  function shortSplitName(split) {
    return split ? split.split_name.split(" (")[0] : "Rana's plan";
  }

  function daysLabel(n) {
    return `${n} ${n === 1 ? "day" : "days"} / week`;
  }

  function ranaSummary(def, data, profile) {
    const split = data.splitById.get(def.split_id);
    const n = Rana.plan.trainingDayCount(def.weekday_map);
    const parts = [daysLabel(n)];
    if (split) parts.push(`~${split.est_session_minutes} min sessions`, split.primary_goal);
    if (profile && FITNESS_LEVEL_LABEL[profile.fitness_level]) parts.push(FITNESS_LEVEL_LABEL[profile.fitness_level]);
    return {
      name: shortSplitName(split),
      meta: parts.join(" · "),
      why: split ? `Built for: ${split.best_for}` : "",
    };
  }

  function ownSummary(def) {
    return {
      name: def.name || "My plan",
      meta: `${daysLabel(Rana.plan.trainingDayCount(def.weekday_map))} · You build each workout`,
    };
  }

  // The exercises of one of Rana's workout days, for the Plan tab.
  function buildDayDetail(workoutId, data, profile) {
    const slots = data.slotsByWorkout.get(workoutId) || [];
    const picks = Rana.plan.suggestWorkout(slots, data, Rana.plan.activeLimitations(profile));
    const list = el("ol", "plan-day-exercises");
    slots.forEach((slot, i) => {
      const exercise = picks[i].exerciseKey ? data.exerciseByKey.get(picks[i].exerciseKey) : null;
      const li = el("li");
      li.appendChild(el("span", "plan-day-exercise-name", exercise ? exercise.exercise_name : slot.movement_pattern));
      li.appendChild(Rana.ui.prescription(slot));
      list.appendChild(li);
    });
    const abs = el("p", "plan-day-abs", `+ Optional abs · ${Rana.plan.ABS_HINT}`);
    const wrap = el("div", "plan-day-detail");
    wrap.append(list, abs);
    return wrap;
  }

  function renderWeek(listEl, { weekdayMap, ownDayNames = {}, data, profile, expandable = false }) {
    listEl.innerHTML = "";
    Rana.plan.WEEKDAY_ORDER.forEach((day) => {
      const id = weekdayMap[day];
      const isOwn = id === Rana.plan.OWN_WORKOUT;
      const workout = id && !isOwn ? data.workoutById.get(id) : null;
      const isTraining = Boolean(isOwn || workout);

      const li = el("li", isTraining ? "plan-hero-day" : "plan-hero-day plan-hero-day--rest");
      li.appendChild(el("span", "plan-hero-dow", day));

      const body = el("span", "plan-hero-day-body");
      const name = el("span", "plan-hero-workout", isOwn ? ownDayNames[day] || "Workout" : workout ? workout.day_name : "Rest");
      body.appendChild(name);
      if (workout) body.appendChild(el("span", "plan-hero-focus", workout.session_focus));
      if (isOwn) body.appendChild(el("span", "plan-hero-focus", "You build this workout"));

      if (expandable && workout) {
        // The day's name becomes a button that shows or hides its exercises.
        const toggle = el("button", "plan-day-toggle");
        toggle.type = "button";
        toggle.setAttribute("aria-expanded", "false");
        toggle.append(...body.childNodes);
        const chevron = el("span", "plan-day-chevron"); // drawn in CSS
        chevron.setAttribute("aria-hidden", "true");
        toggle.appendChild(chevron);
        body.appendChild(toggle);
        let detail = null;
        toggle.addEventListener("click", () => {
          const open = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!open));
          if (!detail) {
            detail = buildDayDetail(id, data, profile);
            body.appendChild(detail);
          }
          detail.hidden = open;
        });
      }

      li.appendChild(body);
      listEl.appendChild(li);
    });
  }

  return { renderWeek, ranaSummary, ownSummary, FITNESS_LEVEL_LABEL };
})();
