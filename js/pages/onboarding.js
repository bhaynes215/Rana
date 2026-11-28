// The questionnaire screen. It draws whichever question is current from the
// definitions in js/core/questions.js: Rana asks it in a speech bubble, the
// answers sit below. One question per screen, with a back button, a progress
// bar, and the browser's own back button stepping back one question.
//
// The answers live in one plain object (`answers`, keyed by profile field),
// so going back and changing an earlier answer is just drawing that question
// again with its saved value. Nothing is saved until the last question.

Rana.page.start({
  requires: "none", // the questionnaire is where the profile comes from
  render({ data }) {
    const { el, button } = Rana.ui;
    const questions = Rana.questions;
    const main = document.getElementById("main");

    const answers = { starting_lifts: {} };
    let pos = { q: 0, lift: 0 }; // which question, and (lifts question only) which lift
    let autoAdvance = null; // a pending "pick an option, then move on" timer
    let liftCache = { key: "", lifts: [] };
    let footer = null;

    // ---- The screen's fixed parts ---------------------------------------
    const topbar = Rana.ui.topbar({ onBack: () => history.back(), current: 1, total: 15 });
    const backButton = topbar.querySelector(".btn--icon");
    const stage = el("div", "q-stage");
    const announce = el("p", "sr-only", "", { "aria-live": "polite" }); // tells screen readers the new question
    main.append(topbar, stage, announce);

    // ---- Where we are -----------------------------------------------------
    const asked = () => questions.active(answers);
    const current = () => asked()[Math.min(pos.q, asked().length - 1)];
    const isLast = () => pos.q >= asked().length - 1;

    // The main lifts of the plan Rana is about to pick (goal, days, weekdays
    // and limitations are all answered by the time the lifts question comes).
    function liftsToAsk() {
      const profile = questions.toProfile(answers);
      const key = JSON.stringify([profile.goal, profile.training_days_per_week, profile.training_weekdays, profile.limitations]);
      if (liftCache.key !== key) {
        const splitId = Rana.plan.matchSplit(profile, data.splits);
        const weekdayMap = Rana.plan.buildWeekdayMap(data.workoutsBySplit.get(splitId) || [], profile.training_weekdays);
        liftCache = { key, lifts: Rana.plan.mainLifts({ weekday_map: weekdayMap }, data, profile) };
      }
      return liftCache.lifts;
    }

    // ---- Moving between questions -----------------------------------------
    const hashFor = (p) => `#q${p.q + 1}${p.lift ? `-${p.lift + 1}` : ""}`;

    function goTo(next) {
      history.pushState(next, "", hashFor(next));
      show(next);
    }

    function advance() {
      const q = current();
      if (q.type === "lifts" && pos.lift < liftsToAsk().length - 1) return goTo({ q: pos.q, lift: pos.lift + 1 });
      if (isLast()) return finish();
      const nextIndex = pos.q + 1;
      // A question may turn out to have nothing to ask (no main lifts to report).
      if (asked()[nextIndex].type === "lifts" && !liftsToAsk().length) return finish();
      goTo({ q: nextIndex, lift: 0 });
    }

    window.addEventListener("popstate", (event) => show(event.state || { q: 0, lift: 0 }));
    history.replaceState({ q: 0, lift: 0 }, "", "#q1");

    // Draws a question. The change goes through a page transition so the old
    // question fades into the new one; Rana's bubble then rises into place.
    function show(next, { animate = true } = {}) {
      clearTimeout(autoAdvance);
      pos = next;
      const draw = () => {
        const q = current();
        const built = q.type === "lifts" ? buildLifts(q) : buildQuestion(q);
        stage.replaceChildren(...built.nodes);
        setFooter(built.footer);
        topbar.update(pos.q + 1, asked().length);
        backButton.style.visibility = pos.q === 0 && pos.lift === 0 ? "hidden" : "visible";
        announce.textContent = built.prompt;
        window.scrollTo(0, 0);
        built.focus && built.focus.focus({ preventScroll: true });
      };
      return animate ? Rana.ui.transition(draw) : draw();
    }

    // The pinned buttons change with each question (none for the auto-advancing ones).
    function setFooter(children) {
      footer && footer.remove();
      footer = null;
      document.body.classList.toggle("has-footer", Boolean(children));
      document.body.classList.toggle("has-footer--tall", Boolean(children) && children.length > 1);
      if (!children) return;
      footer = Rana.ui.footerBar(children);
      document.body.append(footer);
    }

    // ---- Ordinary questions -----------------------------------------------
    function buildQuestion(q) {
      const prompt = q.prompt(answers);
      const nodes = [Rana.ui.interview(prompt, { pose: q.pose })];

      // Checks the answer; on a mistake shows how to fix it and stays put.
      const submit = () => {
        const value = control.read();
        const error = q.validate ? q.validate(value, answers) : null;
        if (error) return control.showError(error);
        answers[q.field] = value;
        advance();
      };
      const control = Rana.answerControl(q, answers, {
        onEnter: submit,
        // Picking a single answer saves it and moves on after a short beat.
        onChange: (value) => {
          answers[q.field] = value;
          if (q.type === "days" && (answers.training_weekdays || []).length !== value) answers.training_weekdays = [];
          clearTimeout(autoAdvance);
          autoAdvance = setTimeout(advance, 250);
        },
      });
      nodes.push(control.el);

      // Text, number and multiple-answer questions end with Continue; the
      // single-choice ones move on by themselves.
      const choosesOne = q.type === "single" || q.type === "days";
      const footerNodes = choosesOne ? null : [button({ label: "Continue", kind: "primary", onClick: submit })];
      if (q.optional && footerNodes) footerNodes.push(button({ label: "Skip for now", kind: "text", onClick: () => { answers[q.field] = ""; advance(); } }));
      return { nodes, footer: footerNodes, focus: control.focus, prompt };
    }

    // ---- The lifts question -------------------------------------------------
    // One question asked once per main lift: a recent set, shown as an
    // estimated max with the first target it will lead to. Skippable per lift.
    function buildLifts() {
      const lifts = liftsToAsk();
      const lift = lifts[pos.lift];
      const exercise = data.exerciseByKey.get(lift.exercise_key);
      const reps = lift.unit === "reps";
      const name = questions.liftName(exercise);
      const prompt = reps ? `How many ${name}s can you do in one good set?` : `What's a recent ${name} set you did with good form?`;
      const saved = answers.starting_lifts[lift.exercise_key];
      const filled = saved && !saved.skipped ? saved : null;

      const weightField = reps ? null : Rana.ui.field({ label: "Weight", unit: "lb", value: filled ? String(filled.weight) : "" });
      const repsField = Rana.ui.field({ label: "Reps", value: filled ? String(filled.reps) : "" });
      const fields = el("div", reps ? "q-fields q-fields--single" : "q-fields", [weightField, repsField]);

      // The live estimate: the best number this set could mean, and the target it leads to.
      const label = el("p", "lift-readout__label", reps ? "Your best set" : "Estimated max");
      const number = el("span", "t-display num", "—");
      const unit = el("span", "lift-readout__unit", "");
      const target = el("p", "lift-readout__target", "");
      const readout = el("div", "lift-readout", [label, el("div", "lift-readout__value", [number, unit]), target]);

      const read = () => ({ weight: weightField ? Number(weightField.getValue()) : 0, reps: Number(repsField.getValue()) });
      const problem = ({ weight, reps: r }) => ({
        reps: r >= 1 && r <= 30 ? null : "Enter reps between 1 and 30.",
        weight: reps || (weight >= 1 && weight <= 1000) ? null : "Enter a weight between 1 and 1,000 lb.",
      });
      const refresh = () => {
        const set = read();
        const p = problem(set);
        if (p.reps || p.weight || !repsField.getValue() || (weightField && !weightField.getValue())) {
          number.textContent = "—";
          unit.textContent = "";
          target.textContent = reps ? "Enter your reps to see your best set." : "Enter a weight and reps to see your estimated max.";
          return;
        }
        const score = reps ? set.reps : Rana.game.estimatedOneRepMax(set.weight, set.reps);
        const goal = Rana.game.nextTarget(score, lift.unit, { fitness_level: answers.fitness_level });
        number.textContent = String(Math.round(score));
        unit.textContent = reps ? "reps" : "lb";
        target.textContent = reps
          ? `Your first ${name} target will be ${goal} reps in one set. You'll see it on your Progress page.`
          : `Your first ${name} target will be ${goal} lb. You'll see it on your Progress page.`;
      };
      [weightField, repsField].forEach((f) => f && f.input.addEventListener("input", refresh));

      const submit = () => {
        const set = read();
        const p = problem(set);
        if (weightField && p.weight) weightField.setError(p.weight);
        if (p.reps) repsField.setError(p.reps);
        if (p.reps || p.weight) return;
        answers.starting_lifts[lift.exercise_key] = { weight: reps ? 0 : set.weight, reps: set.reps };
        advance();
      };
      [weightField, repsField].forEach((f) => f && f.input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }));

      const last = pos.lift >= lifts.length - 1;
      const nextName = last ? "" : questions.liftName(data.exerciseByKey.get(lifts[pos.lift + 1].exercise_key));
      const steps = Rana.ui.stepChips({ steps: lifts.map((l) => questions.liftLabel(data.exerciseByKey.get(l.exercise_key))), current: pos.lift });

      refresh();
      return {
        nodes: [Rana.ui.interview(prompt, { pose: "neutral" }), el("div", "answer", [steps, fields, readout])],
        footer: [
          button({ label: last ? "See my plan" : `Next: ${nextName}`, kind: "primary", onClick: submit }),
          button({ label: "I haven't done this", kind: "text", onClick: () => { answers.starting_lifts[lift.exercise_key] = { skipped: true }; advance(); } }),
        ],
        focus: weightField ? weightField.input : repsField.input,
        prompt,
      };
    }

    // ---- Done: build the profile and the plan, then show it ------------------
    function finish() {
      const profile = questions.toProfile(answers);
      const splitId = Rana.plan.matchSplit(profile, data.splits);
      if (!splitId) {
        Rana.ui.sheet({
          title: "I couldn't build your plan",
          message: "No workout split matches that goal and number of days. Go back and change one of them.",
          actions: [{ label: "Back to the questions", kind: "primary" }],
        });
        return;
      }
      const weekdayMap = Rana.plan.buildWeekdayMap(data.workoutsBySplit.get(splitId) || [], profile.training_weekdays);

      // Keep answers only for the lifts that plan actually has (an earlier answer may have changed).
      const mainKeys = new Set(Rana.plan.mainLifts({ weekday_map: weekdayMap }, data, profile).map((l) => l.exercise_key));
      profile.starting_lifts = Object.fromEntries(Object.entries(answers.starting_lifts).filter(([key]) => mainKeys.has(key)));

      Rana.storage.saveProfile(profile);
      Rana.storage.savePlan({
        split_id: splitId,
        training_weekdays: profile.training_weekdays,
        weekday_map: weekdayMap,
        start_date: null, // set on the plan reveal, when the user starts the plan
        status: "draft",
        active_plan_id: "rana",
      });
      // A fresh questionnaire starts over with Rana's new plan and no own plan.
      Rana.storage.resetSavedPlans({
        plan_id: "rana",
        kind: "suggested",
        split_id: splitId,
        training_weekdays: profile.training_weekdays,
        weekday_map: { ...weekdayMap },
      });
      window.location.href = "plan-reveal.html";
    }

    show(pos, { animate: false }); // the first question simply appears
  },
});
