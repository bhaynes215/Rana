// The exercise picker for freestyle workouts: a full-screen panel with a
// search box, seven muscle groups, and multi-select ("Add 3 exercises").
// Modeled on the simple list-of-groups pickers workout apps use.
//
// Freestyle shows EVERY exercise in the library: no filtering, no warnings.
// A user's reported limitations only ever shape the SUGGESTED workout
// (see plan.js) — when you choose your own exercises, you're in charge.
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

  // The shared element builder (ui.js). NOTE: this picker still uses the old
  // look's classes; Phase 6 of the redesign rebuilds it as a sheet.
  const el = Rana.ui.el;

  // Compound lifts first (they're what most workouts are built around),
  // then alphabetical.
  function sortExercises(list) {
    return [...list].sort((a, b) => {
      if (a.is_compound !== b.is_compound) return a.is_compound ? -1 : 1;
      return a.exercise_name.localeCompare(b.exercise_name);
    });
  }

  function open({ data, addedKeys = new Set(), onAdd }) {
    const opener = document.activeElement;
    const selected = []; // exercise_keys in the order they were tapped
    let currentGroup = null; // null = the list of muscle groups
    let query = "";

    // --- Shell ---
    const root = el("div", "picker");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Select exercise");
    root.tabIndex = -1;

    const header = el("header", "picker-header");
    const cancelBtn = el("button", "picker-cancel", "Cancel");
    cancelBtn.type = "button";
    header.append(cancelBtn, el("h2", "picker-title", "Select exercise"), el("span"));

    const searchWrap = el("div", "picker-search");
    const searchInput = el("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search exercises";
    searchInput.setAttribute("aria-label", "Search exercises");
    searchInput.autocomplete = "off";
    searchWrap.appendChild(searchInput);

    const body = el("div", "picker-body");

    const footer = el("footer", "picker-footer");
    const addBtn = el("button", "btn-continue picker-add", "Add exercises");
    addBtn.type = "button";
    addBtn.disabled = true;
    footer.appendChild(addBtn);

    root.append(header, searchWrap, body, footer);
    document.body.appendChild(root);
    document.body.classList.add("picker-open");

    // --- Closing ---
    function close() {
      document.removeEventListener("keydown", onKeydown);
      root.remove();
      document.body.classList.remove("picker-open");
      if (opener && opener.focus) opener.focus();
    }
    function onKeydown(event) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeydown);
    cancelBtn.addEventListener("click", close);

    // --- Footer button text ---
    function updateFooter() {
      const n = selected.length;
      addBtn.disabled = n === 0;
      addBtn.textContent = n === 0 ? "Add exercises" : `Add ${n} exercise${n === 1 ? "" : "s"}`;
    }
    addBtn.addEventListener("click", () => {
      if (selected.length === 0) return;
      const keys = [...selected];
      close();
      onAdd(keys);
    });

    // --- Rows ---
    function groupRow(group) {
      const count = data.exercises.filter((e) => group.muscles.includes(e.muscle_group)).length;
      const row = el("button", "picker-row picker-row--group");
      row.type = "button";
      row.append(el("span", "picker-row-name", group.name), el("span", "picker-row-count num", String(count)), el("span", "picker-chevron", "›"));
      row.addEventListener("click", () => {
        currentGroup = group;
        render();
        body.scrollTop = 0;
      });
      return row;
    }

    function exerciseRow(ex) {
      const already = addedKeys.has(ex.exercise_key);
      const row = el("button", "picker-row picker-row--exercise");
      row.type = "button";
      row.disabled = already;
      row.setAttribute("aria-pressed", String(selected.includes(ex.exercise_key)));

      const name = el("span", "picker-row-name", ex.exercise_name);
      const tag = el("span", "picker-tag", ex.equipment);
      const state = el("span", "picker-row-state", already ? "Added" : "");
      row.append(name, tag, state);

      row.addEventListener("click", () => {
        const i = selected.indexOf(ex.exercise_key);
        if (i === -1) selected.push(ex.exercise_key);
        else selected.splice(i, 1);
        row.setAttribute("aria-pressed", String(i === -1));
        updateFooter();
      });
      return row;
    }

    // --- Views: muscle groups → one group's exercises, or flat search results ---
    function render() {
      body.innerHTML = "";
      const q = query.trim().toLowerCase();

      if (q) {
        const matches = sortExercises(
          data.exercises.filter(
            (e) =>
              e.exercise_name.toLowerCase().includes(q) ||
              e.equipment.toLowerCase().includes(q) ||
              e.muscle_group.toLowerCase().includes(q)
          )
        );
        if (matches.length === 0) body.appendChild(el("p", "picker-empty", "No exercises match your search."));
        matches.forEach((ex) => body.appendChild(exerciseRow(ex)));
      } else if (currentGroup) {
        const back = el("button", "picker-row picker-row--back");
        back.type = "button";
        back.append(el("span", "picker-chevron picker-chevron--back", "‹"), el("span", "picker-row-name", currentGroup.name));
        back.addEventListener("click", () => {
          currentGroup = null;
          render();
        });
        body.appendChild(back);
        const inGroup = data.exercises.filter((e) => currentGroup.muscles.includes(e.muscle_group));
        sortExercises(inGroup).forEach((ex) => body.appendChild(exerciseRow(ex)));
      } else {
        GROUPS.forEach((g) => body.appendChild(groupRow(g)));
      }
    }

    searchInput.addEventListener("input", () => {
      query = searchInput.value;
      render();
    });

    render();
    updateFooter();
    root.focus(); // not the search box: that would pop the keyboard open on phones
  }

  return { open, GROUPS };
})();
