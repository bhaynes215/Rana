// The exercise picker for freestyle workouts: a tall sheet with a search box,
// seven muscle groups, and multi-select ("Add 3 exercises").
//
// Freestyle shows EVERY exercise in the library: no filtering, no warnings.
// A user's reported limitations only ever shape the SUGGESTED workout
// (see plan.js): when you choose your own exercises, you're in charge.
//
// Usage:
//   Rana.picker.open({
//     data,                       // the object from Rana.data.load()
//     addedKeys: new Set([...]),  // exercises already in the workout (shown as "Added")
//     onAdd(keys) { ... },        // called with the exercise_keys chosen, in tap order
//   });

window.Rana = window.Rana || {};

Rana.picker = (() => {
  // The library has 11 muscle groups; the picker shows 7 plain ones.
  // Traps live under Back, and the four leg muscles are all "Legs".
  const GROUPS = [
    { name: "Chest", muscles: ["Chest"] },
    { name: "Back", muscles: ["Back", "Traps"] },
    { name: "Shoulders", muscles: ["Shoulders"] },
    { name: "Biceps", muscles: ["Biceps"] },
    { name: "Triceps", muscles: ["Triceps"] },
    { name: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Calves"] },
    { name: "Core", muscles: ["Core"] },
  ];

  // Compound lifts first (they're what most workouts are built around),
  // then alphabetical.
  function sortExercises(list) {
    return [...list].sort((a, b) => {
      if (a.is_compound !== b.is_compound) return a.is_compound ? -1 : 1;
      return a.exercise_name.localeCompare(b.exercise_name);
    });
  }

  function open({ data, addedKeys = new Set(), onAdd }) {
    const { el, button } = Rana.ui;
    const selected = []; // exercise_keys in the order they were tapped
    let group = null; // null = the list of muscle groups
    let query = "";

    const search = Rana.ui.field({ label: "Search exercises", kind: "text", placeholder: "Search" });
    const list = el("div", "picker__list");
    const addButton = button({ label: "Add exercises", kind: "primary", disabled: true });
    const sheet = Rana.ui.sheet({
      title: "Add exercises",
      content: el("div", "picker", [search, list, addButton]),
      className: "sheet--tall",
      initialFocus: "panel",
    });

    function updateAddButton() {
      addButton.disabled = selected.length === 0;
      addButton.textContent = selected.length === 0 ? "Add exercises" : `Add ${selected.length} exercise${selected.length === 1 ? "" : "s"}`;
    }
    addButton.addEventListener("click", () => {
      const keys = [...selected];
      sheet.close(keys);
      onAdd(keys);
    });

    // A row styled like an option card; `mark` adds the check circle.
    function row({ label, description, mark, onClick, disabled = false, checked = false }) {
      const text = el("span", "option__text", [el("span", "option__label", label), description && el("span", "option__desc", description)]);
      const end = mark ? el("span", "option__mark", Rana.icons.svg("check", { size: 14, stroke: 3 }), { "aria-hidden": "true" }) : null;
      const node = el("button", `option option--compact picker__row`, [text, end, !mark && onClick ? Rana.icons.svg("forward", { size: 20 }) : null], {
        type: "button",
        role: mark ? "checkbox" : null,
        "aria-checked": mark ? String(checked) : null,
        disabled,
      });
      if (onClick) node.addEventListener("click", () => onClick(node));
      return node;
    }

    function exerciseRow(exercise) {
      const added = addedKeys.has(exercise.exercise_key);
      return row({
        label: exercise.exercise_name,
        description: added ? `${exercise.equipment} · Added` : exercise.equipment,
        mark: true,
        checked: selected.includes(exercise.exercise_key),
        disabled: added,
        onClick: (node) => {
          const i = selected.indexOf(exercise.exercise_key);
          if (i === -1) selected.push(exercise.exercise_key);
          else selected.splice(i, 1);
          node.setAttribute("aria-checked", String(i === -1));
          updateAddButton();
        },
      });
    }

    // Muscle groups -> one group's exercises, or flat search results.
    function render() {
      list.replaceChildren();
      const q = query.trim().toLowerCase();
      if (q) {
        const matches = sortExercises(data.exercises.filter((e) => [e.exercise_name, e.equipment, e.muscle_group].some((t) => t.toLowerCase().includes(q))));
        if (!matches.length) list.append(el("p", "picker__empty", "No exercises match your search."));
        matches.forEach((e) => list.append(exerciseRow(e)));
      } else if (group) {
        list.append(button({ label: group.name, kind: "plain", icon: "back", onClick: () => { group = null; render(); } }));
        sortExercises(data.exercises.filter((e) => group.muscles.includes(e.muscle_group))).forEach((e) => list.append(exerciseRow(e)));
      } else {
        GROUPS.forEach((g) => {
          const count = data.exercises.filter((e) => g.muscles.includes(e.muscle_group)).length;
          list.append(row({ label: g.name, description: `${count} exercises`, onClick: () => { group = g; render(); list.scrollTop = 0; } }));
        });
      }
    }

    search.input.addEventListener("input", () => { query = search.input.value; render(); });
    render();
    return sheet;
  }

  return { open, GROUPS };
})();
