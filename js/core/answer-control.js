// The control for one questionnaire answer, built from its definition in
// questions.js. The questionnaire screen uses it to ask each question and the
// Profile screen uses it to edit one, so a question looks and behaves the same
// in both places.
//
//   const control = Rana.answerControl(question, answers, { onChange })
//   control.el            the controls (add it to the page or a sheet)
//   control.read()        the current answer
//   control.showError(m)  show how to fix a mistake
//   control.focus         the input to focus first, or null
//
// `answers` is the profile so far (some questions use earlier answers: the
// days helper needs the fitness level). `onChange(value)` fires when a
// single-choice answer is picked (the questionnaire moves on by itself then).
// Only the answer types a profile edits are handled here; the lifts question
// has its own screens.

window.Rana = window.Rana || {};

Rana.answerControl = (question, answers, { onChange, onEnter } = {}) => {
  const { el } = Rana.ui;
  const q = question;
  const area = el("div", "answer");
  let read = () => undefined;
  let showError = () => {};
  let focus = null;

  if (q.type === "text" || q.type === "number") {
    const field = Rana.ui.field({ label: q.label, kind: q.type, unit: q.unit, value: answers[q.field] ?? "", placeholder: q.placeholder, autocomplete: q.autocomplete, onEnter });
    area.append(field);
    read = () => field.getValue();
    showError = (message) => field.setError(message);
    focus = field.input;
  } else if (q.type === "height") {
    // Two boxes, feet and inches. The answer is one number in centimeters
    // (see questions.js); "" until feet are filled in.
    const known = answers[q.field] !== "" && answers[q.field] !== null && answers[q.field] !== undefined && Number(answers[q.field]) > 0;
    const parts = known ? Rana.questions.heightParts(answers[q.field]) : null;
    const feet = Rana.ui.field({ label: "Feet", unit: "ft", value: parts ? String(parts.feet) : "", onEnter });
    const inches = Rana.ui.field({ label: "Inches", unit: "in", decimal: true, value: parts ? String(parts.inches) : "", onEnter });
    area.append(el("div", "q-fields", [feet, inches]));
    read = () => Rana.questions.heightFromParts(feet.getValue(), inches.getValue());
    showError = (message) => feet.setError(message);
    inches.input.addEventListener("input", () => feet.setError(null)); // a typing change clears the message
    focus = feet.input;
  } else if (q.type === "single" || q.type === "days") {
    const group = Rana.ui.optionGroup({
      label: q.label,
      options: q.options,
      value: answers[q.field] === undefined || answers[q.field] === null ? null : String(answers[q.field]),
      variant: q.type === "days" ? "tile" : "card",
      onChange: (value) => onChange && onChange(q.type === "days" ? Number(value) : value),
    });
    area.append(group);
    if (q.type === "days") {
      group.setTags(Object.fromEntries((Rana.plan.RECOMMENDED_DAYS[answers.fitness_level] || []).map((n) => [n, "Recommended"])));
      area.append(el("p", "answer__helper", q.helper(answers)));
    }
    if (q.footnote) area.append(el("p", "answer__note", q.footnote));
    read = () => {
      const value = group.getValue();
      return q.type === "days" && value !== null ? Number(value) : value;
    };
  } else {
    // "multi" (limitations) and "weekdays": several answers.
    const error = el("p", "answer__error", "", { role: "alert" });
    error.hidden = true;
    const group = Rana.ui.optionGroup({
      label: q.label, options: q.options, value: answers[q.field] || [], multiple: true, variant: "compact",
      onChange: (values, changed) => {
        // "None of these" excludes every other answer, and any other answer removes it.
        const next = q.exclusive
          ? changed === q.exclusive ? (values.includes(changed) ? [changed] : []) : values.filter((v) => v !== q.exclusive)
          : values;
        group.setValue(next);
        error.hidden = true;
      },
    });
    area.append(group, error);
    read = () => group.getValue();
    showError = (message) => { error.textContent = message; error.hidden = false; };
  }

  return { el: area, read: () => read(), showError: (m) => showError(m), focus };
};
