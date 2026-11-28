// Visual components: Rana, speech bubbles, progress bars, option cards, the
// collapsible, form fields, chips, the set table and the week displays.
// They extend the `Rana.ui` object that ui.js creates, so load ui.js first.
// Their CSS is in css/components.css; the specs are in
// docs/redesign/handoff/components.md.
//
// Every component is a function that RETURNS A DOM ELEMENT. Where a component
// has something that changes (a progress value, a selection, an error), the
// element carries small methods for it: bar.update(...), group.setValue(...),
// field.setError(...). Nothing here fetches data or touches storage; screens
// pass numbers and text in.

(() => {
  const { el, format } = Rana.ui;
  const icon = (name, size, stroke, filled) => Rana.icons.svg(name, { size, stroke, filled });

  // ---------------------------------------------------------------------
  // Rana (the character) and speech bubbles
  // ---------------------------------------------------------------------
  // Poses: wave, think, cheer, neutral (full figure) and avatar (a small
  // round crop for tips). The drawings are decorative, so alt is empty.
  const ASSET_BASE = "assets/rana/";

  function rana(pose = "neutral", width) {
    const img = el("img", pose === "avatar" ? "rana rana--avatar" : "rana", null, {
      src: `${ASSET_BASE}rana-${pose}.svg`,
      alt: "",
      decoding: "async",
    });
    if (width) img.style.setProperty("--rana-w", `${width}px`);
    return img;
  }

  // The big question bubble: Rana on the left, the question on the right.
  // A long line (over ~80 characters) drops one size so it stays readable.
  function interview(text, { pose = "neutral", width = 116 } = {}) {
    const bubbleText = el("p", "", text);
    const bubble = el("div", "bubble bubble--interview bubble--enter", bubbleText);
    const root = el("div", "interview", [rana(pose, width), bubble]);
    root.setText = (next) => {
      bubbleText.textContent = next;
      bubble.classList.toggle("bubble--long", next.length > 80);
    };
    root.setText(text);
    return root;
  }

  // A small coaching tip: avatar plus one short, specific line.
  // Pass { workout: true } for the smaller version used during a workout.
  function ranaTip(text, { workout = false } = {}) {
    const bubbleText = el("p", "", text);
    const root = el("div", workout ? "tip tip--workout" : "tip", [rana("avatar"), el("div", "bubble bubble--tip", bubbleText)]);
    root.setText = (next) => { bubbleText.textContent = next; };
    return root;
  }

  // ---------------------------------------------------------------------
  // Progress bars
  // ---------------------------------------------------------------------
  // Always role="progressbar" with its numbers, and the numbers are always
  // also shown as text next to it. The fill animates only when update() is
  // called with a new value (the first paint is already at its final width).
  function percent(value, max) {
    return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  }

  // variant: "level" (10px) | "thin" (6px, questionnaire) | "lift" (6px on a white card) | "rest" (6px ink)
  function progress({ variant = "level", value, max, label, valueText }) {
    const fill = el("div", "bar__fill");
    const bar = el("div", variant === "level" ? "bar" : `bar bar--${variant === "thin" ? "thin" : variant}`, fill, {
      role: "progressbar",
      "aria-label": label,
      "aria-valuemin": 0,
    });
    bar.update = (nextValue, nextMax = max, nextText) => {
      bar.setAttribute("aria-valuemax", nextMax);
      bar.setAttribute("aria-valuenow", Math.round(nextValue));
      if (nextText) bar.setAttribute("aria-valuetext", nextText);
      fill.style.setProperty("--fill", `${percent(nextValue, nextMax)}%`);
    };
    bar.update(value, max, valueText);
    return bar;
  }

  // Home's level bar: "1,840 / 2,156 XP" under it and "316 XP to Level 8".
  // The bar fills across the CURRENT level (from its start XP to the next
  // level's), while the text shows total XP over the next level's total.
  function levelBar({ xp, level, levelStartXp, nextLevelXp }) {
    const bar = progress({ variant: "level", value: 0, max: 1, label: `Level ${level} progress` });
    const left = el("span", "");
    const right = el("span", "muted");
    const root = el("div", "", [bar, el("div", "bar-numbers num", [left, right])]);
    root.update = (next) => {
      const remaining = Math.max(0, next.nextLevelXp - next.xp);
      bar.setAttribute("aria-label", `Level ${next.level} progress`);
      bar.update(next.xp - next.levelStartXp, next.nextLevelXp - next.levelStartXp, `${format.number(next.xp)} of ${format.number(next.nextLevelXp)} XP`);
      left.replaceChildren(el("strong", "", format.number(next.xp)), el("span", "muted", ` / ${format.number(next.nextLevelXp)} XP`));
      right.textContent = `${format.number(remaining)} XP to Level ${next.level + 1}`;
    };
    root.update({ xp, level, levelStartXp, nextLevelXp });
    return root;
  }

  // A lift's bar on Progress: spans start to target. Under it: where you
  // started, how far you've come, and the target. unit is "lb" or "reps".
  function liftBar({ name, unit = "lb", start, current, target }) {
    const bar = progress({ variant: "lift", value: 0, max: 1, label: `${name} progress` });
    const startEl = el("span", "");
    const gainEl = el("span", "bar-numbers__gain");
    const targetEl = el("span", "");
    const root = el("div", "", [bar, el("div", "bar-numbers bar-numbers--lift num", [startEl, gainEl, targetEl])]);
    root.update = (next) => {
      const gain = Math.round(next.current - next.start);
      bar.update(next.current - next.start, next.target - next.start, `${next.current} ${unit} of a ${next.target} ${unit} target`);
      startEl.textContent = `Started at ${next.start}`;
      gainEl.textContent = `${gain < 0 ? "−" : "+"}${Math.abs(gain)} ${unit}`;
      targetEl.textContent = `Target ${next.target}`;
    };
    root.update({ start, current, target });
    return root;
  }

  // The rest timer row in the workout footer: icon, "Rest 1:42", bar, "2:30".
  // Ink, not marigold, so it never reads as progress toward a goal.
  function restRow({ remaining, total }) {
    const label = el("strong", "", "");
    const bar = progress({ variant: "rest", value: 0, max: 1, label: "Rest time" });
    const totalEl = el("span", "muted", "");
    const root = el("div", "rest-row num", [icon("timer", 18), label, bar, totalEl]);
    root.update = (nextRemaining, nextTotal = total) => {
      label.textContent = nextRemaining > 0 ? `Rest ${format.clock(nextRemaining)}` : "Rest done";
      bar.update(nextTotal - Math.max(0, nextRemaining), nextTotal);
      totalEl.textContent = format.clock(nextTotal);
    };
    root.update(remaining, total);
    return root;
  }

  // Exercise n of N: segments. `filled` is a list of segment indexes to
  // light up; `current` (0-based) is the one being worked on. Give `onSelect`
  // and each segment becomes a button that jumps to that step.
  function stepsBar({ total, current = 0, filled = [], label = "Exercise", onSelect }) {
    const root = el("div", "steps", null, { role: "group", "aria-label": label });
    root.style.setProperty("--steps", total);
    const segs = Array.from({ length: total }, (_, i) => {
      const seg = onSelect
        ? el("button", "steps__seg", null, { type: "button", "aria-label": `Go to ${label.toLowerCase()} ${i + 1}` })
        : el("span", "steps__seg");
      if (onSelect) seg.addEventListener("click", () => onSelect(i));
      root.append(seg);
      return seg;
    });
    root.update = (next) => {
      segs.forEach((seg, i) => {
        seg.classList.toggle("is-filled", next.filled.includes(i));
        if (i === next.current) seg.setAttribute("aria-current", "step");
        else seg.removeAttribute("aria-current");
      });
      root.setAttribute("aria-label", `${label} ${next.current + 1} of ${total}`);
    };
    root.update({ current, filled });
    return root;
  }

  // The questionnaire's top row: back button, thin bar, "n of 15".
  function topbar({ onBack, current, total }) {
    const bar = progress({ variant: "thin", value: current, max: total, label: "Questionnaire progress" });
    const count = el("span", "topbar__count");
    const root = el("div", "topbar", [Rana.ui.iconButton({ icon: "back", label: "Back", onClick: onBack }), bar, count]);
    root.update = (nextCurrent, nextTotal = total) => {
      bar.update(nextCurrent, nextTotal, `${nextCurrent} of ${nextTotal}`);
      count.textContent = `${nextCurrent} of ${nextTotal}`;
    };
    root.update(current, total);
    return root;
  }

  // ---------------------------------------------------------------------
  // Single-choice and multiple-choice groups
  // ---------------------------------------------------------------------
  // Radio-style groups use one tab stop; the arrow keys move focus between
  // the choices and Space or Enter picks one. (Arrows deliberately do NOT
  // pick: a question that advances as soon as an answer is picked would
  // otherwise skip ahead on a single arrow press.)
  function roveFocus(container, items) {
    function setTabStop(active) {
      items.forEach((item) => { item.tabIndex = item === active ? 0 : -1; });
    }
    container.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const at = items.indexOf(document.activeElement);
      if (!step || at < 0) return;
      event.preventDefault();
      const next = items[(at + step + items.length) % items.length];
      setTabStop(next);
      next.focus();
    });
    return setTabStop;
  }

  // options: [{ value, label, description, unit, tag }]
  // variant "card": a row with a label and a description (questionnaire answers)
  // variant "tile": a square with a big number (`label`), `unit`, and an
  //                 optional `tag` such as "Recommended" (training days)
  // variant "compact": a short card in two columns, for long lists (weekdays)
  // multiple: true  -> checkboxes; value is an array
  function optionGroup({ label, options, value, onChange, variant = "card", multiple = false }) {
    const role = multiple ? "checkbox" : "radio";
    const root = el("div", variant === "tile" || variant === "compact" ? "option-grid" : "option-list", null, {
      role: multiple ? "group" : "radiogroup",
      "aria-label": label,
    });
    let current = multiple ? [...(value || [])] : value ?? null;

    const items = options.map((option) => {
      const mark = el("span", "option__mark", icon("check", 14, 3), { "aria-hidden": "true" });
      const body = variant === "tile"
        ? [el("span", "tile__number", option.label), el("span", "tile__unit", option.unit), el("span", "tile__tag", option.tag || ""), mark]
        : [el("span", "option__text", [el("span", "option__label", option.label), option.description && el("span", "option__desc", option.description)]), mark];
      const item = el("button", variant === "tile" ? "option option--tile" : variant === "compact" ? "option option--compact" : "option", body, { type: "button", role, "aria-checked": "false" });
      item.dataset.value = option.value;
      item.addEventListener("click", () => {
        if (multiple) current = current.includes(option.value) ? current.filter((v) => v !== option.value) : [...current, option.value];
        else current = option.value;
        paint();
        if (onChange) onChange(multiple ? [...current] : current, option.value);
      });
      root.append(item);
      return item;
    });

    const setTabStop = multiple ? null : roveFocus(root, items);

    function paint() {
      items.forEach((item, i) => {
        const on = multiple ? current.includes(options[i].value) : current === options[i].value;
        item.setAttribute("aria-checked", on ? "true" : "false");
      });
      if (setTabStop) setTabStop(items.find((item) => item.getAttribute("aria-checked") === "true") || items[0]);
    }

    root.getValue = () => (multiple ? [...current] : current);
    root.setValue = (next) => { current = multiple ? [...(next || [])] : next ?? null; paint(); };
    // Tiles only: set which counts show a tag, e.g. { 3: "Recommended" }.
    root.setTags = (tags) => {
      items.forEach((item, i) => {
        const tag = item.querySelector(".tile__tag");
        if (tag) tag.textContent = tags[options[i].value] || "";
      });
    };
    paint();
    return root;
  }

  // Exercise choices for a slot: a row of chips that scrolls sideways.
  function chipGroup({ label, options, value, onChange }) {
    const root = el("div", "chips", null, { role: "radiogroup", "aria-label": label });
    let current = value ?? null;
    const items = options.map((option) => {
      const chip = el("button", "chip", option.label, { type: "button", role: "radio", "aria-checked": "false" });
      chip.addEventListener("click", () => {
        current = option.value;
        paint();
        if (onChange) onChange(current);
      });
      root.append(chip);
      return chip;
    });
    const setTabStop = roveFocus(root, items);
    function paint() {
      items.forEach((chip, i) => chip.setAttribute("aria-checked", options[i].value === current ? "true" : "false"));
      setTabStop(items.find((chip) => chip.getAttribute("aria-checked") === "true") || items[0]);
    }
    root.getValue = () => current;
    root.setValue = (next) => { current = next; paint(); };
    paint();
    return root;
  }

  // "Bench press · Squat · Deadlift": a solid ink chip marks the current step.
  function stepChips({ steps, current }) {
    const root = el("div", "step-chips", null, { role: "list", "aria-label": "Steps" });
    root.update = (nextCurrent) => {
      root.replaceChildren(...steps.map((text, i) => el("span", i === nextCurrent ? "step-chip is-current" : "step-chip", text, {
        role: "listitem",
        "aria-current": i === nextCurrent ? "step" : null,
      })));
    };
    root.update(current);
    return root;
  }

  // ---------------------------------------------------------------------
  // Collapsible ("How to do it")
  // ---------------------------------------------------------------------
  let collapsibleCount = 0;
  function collapsible({ title, subtitle, iconName = "play", body, open = false }) {
    const bodyId = `collapsible-${++collapsibleCount}`;
    const chevron = icon("down", 22);
    chevron.classList.add("collapsible__chevron");
    const head = el("button", "collapsible__head", [
      el("span", "collapsible__icon", icon(iconName, 18), { "aria-hidden": "true" }),
      el("span", "collapsible__text", [el("span", "collapsible__title", title), subtitle && el("span", "collapsible__sub", subtitle)]),
      chevron,
    ], { type: "button", "aria-expanded": "false", "aria-controls": bodyId });
    const content = el("div", "collapsible__body", body, { id: bodyId });
    const root = el("div", "collapsible", [head, content]);
    root.setOpen = (next) => {
      head.setAttribute("aria-expanded", next ? "true" : "false");
      content.hidden = !next;
    };
    head.addEventListener("click", () => root.setOpen(head.getAttribute("aria-expanded") !== "true"));
    root.setOpen(open);
    return root;
  }

  // The tutorial video slot. No videos exist yet, so it says so.
  function videoSlot({ caption = "Video coming soon", duration } = {}) {
    return el("div", "video", [
      el("span", "video__play", icon("play", 22, undefined, true), { "aria-hidden": "true" }),
      el("span", "video__caption", caption),
      duration && el("span", "video__time num", duration),
    ], { role: "img", "aria-label": caption });
  }

  // "Muscles worked": the main muscle in marigold, the helpers in grey.
  function muscleChips({ primary, secondary = [] }) {
    return el("div", "muscle-chips", [
      primary && el("span", "muscle-chip muscle-chip--primary", primary),
      ...secondary.map((name) => el("span", "muscle-chip", name)),
    ]);
  }

  // ---------------------------------------------------------------------
  // Fields and the set table
  // ---------------------------------------------------------------------
  // The questionnaire's input: label above, a 60px box, a unit inside.
  //   kind "number" -> digits only (decimal: true for one decimal point)
  //   kind "text"   -> any text
  function field({ label, kind = "number", unit, value = "", placeholder, decimal = false, autocomplete, onEnter }) {
    const input = el("input", "field__input", null, { placeholder, autocomplete });
    if (kind === "number") Rana.ui.numericField(input, { decimal });
    else input.type = "text";
    input.value = value;
    const error = el("span", "field__error", "", { "aria-live": "polite" });
    error.hidden = true;
    const root = el("label", "field", [
      el("span", "field__label", label),
      el("span", "field__control", [input, unit && el("span", "field__unit", unit)]),
      error,
    ]);
    root.input = input;
    root.getValue = () => input.value.trim();
    root.setError = (message) => {
      root.classList.toggle("field--error", Boolean(message));
      error.textContent = message || "";
      error.hidden = !message;
      input.setAttribute("aria-invalid", message ? "true" : "false");
    };
    input.addEventListener("input", () => root.setError(null));
    if (onEnter) input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } });
    return root;
  }

  // The done toggle: a 44px button around a 30px circle.
  function doneToggle({ name, pressed = false, onToggle }) {
    const dot = el("span", "done__dot", icon("check", 16, 3));
    const root = el("button", "done", dot, { type: "button", "aria-pressed": "false" });
    root.set = (next) => {
      root.setAttribute("aria-pressed", next ? "true" : "false");
      root.setAttribute("aria-label", `Mark ${name} ${next ? "not done" : "done"}`);
    };
    root.set(pressed);
    root.addEventListener("click", () => onToggle && onToggle(root.getAttribute("aria-pressed") !== "true"));
    return root;
  }

  // One row of the set table. It builds the look; the screen decides what
  // marking a set done means (validate, save it) by handling onToggle and
  // calling row.setDone(). `last` is the previous session's set, "135 × 8".
  function setRow({ index, last, weight = "", reps = "", done = false, bodyweight = false, repsPlaceholder = "", onToggle }) {
    const weightInput = Rana.ui.numericField(el("input", "set-input", null, {
      "aria-label": `Set ${index} weight in pounds`,
      placeholder: bodyweight ? "+lb" : "",
    }), { decimal: true });
    const repsInput = Rana.ui.numericField(el("input", "set-input", null, {
      "aria-label": `Set ${index} reps`,
      placeholder: repsPlaceholder,
    }));
    weightInput.value = weight;
    repsInput.value = reps;

    const toggle = doneToggle({ name: `set ${index}`, pressed: done, onToggle: (next) => onToggle && onToggle(next, row) });
    // Plain groups, not ARIA table roles: a table role on a button or an input
    // would replace what it is. Each control has its own accessible name.
    const row = el("div", "set-row", [
      el("span", "set-row__n", String(index)),
      el("span", "set-row__last num", last || "—"),
      weightInput,
      repsInput,
      toggle,
    ], { role: "group", "aria-label": `Set ${index}` });

    row.weightInput = weightInput;
    row.repsInput = repsInput;
    row.values = () => ({ weight: weightInput.value.trim(), reps: repsInput.value.trim() });
    // A logged set locks and reads as plain text; un-marking unlocks it.
    row.setDone = (next) => {
      row.classList.toggle("is-done", next);
      weightInput.readOnly = next;
      repsInput.readOnly = next;
      toggle.set(next);
      row.dispatchEvent(new CustomEvent("setchange", { bubbles: true }));
    };
    // which: "weight" | "reps" | null
    row.setError = (which) => {
      weightInput.classList.toggle("is-error", which === "weight");
      repsInput.classList.toggle("is-error", which === "reps");
      weightInput.setAttribute("aria-invalid", which === "weight" ? "true" : "false");
      repsInput.setAttribute("aria-invalid", which === "reps" ? "true" : "false");
    };
    row.setDone(done);
    return row;
  }

  // The header row plus the sets. The first set not done is the active one
  // (white); the table keeps that up to date as rows change.
  function setTable({ label = "Sets" } = {}) {
    // The header is only a visual guide (each input names itself), so it is hidden from screen readers.
    const root = el("div", "set-table", el("div", "set-head", ["Set", "Last time", "lb", "Reps", "Done"].map((text) => el("span", "", text)), { "aria-hidden": "true" }), {
      role: "group",
      "aria-label": label,
    });
    root.rows = [];
    root.refresh = () => {
      const active = root.rows.find((row) => !row.classList.contains("is-done"));
      root.rows.forEach((row) => row.classList.toggle("is-active", row === active));
    };
    root.addRow = (row) => {
      root.rows.push(row);
      root.append(row);
      root.refresh();
      return row;
    };
    root.removeRow = (row) => {
      root.rows = root.rows.filter((r) => r !== row);
      row.remove();
      root.refresh();
    };
    root.addEventListener("setchange", root.refresh);
    return root;
  }

  // ---------------------------------------------------------------------
  // The week
  // ---------------------------------------------------------------------
  // Plan reveal / Plan tab: seven tall blocks. days: [{ short: "Mon", lines: ["Upper","A"] }]
  // where `lines` is null on a rest day.
  function weekStrip({ days, label = "Your week" }) {
    return el("ol", "week-strip", days.map((day) => el("li", "week-strip__day", [
      el("span", "week-strip__name", day.short),
      day.lines
        ? el("span", "week-strip__block week-strip__block--train", day.lines.map((line) => el("span", "", line)))
        : el("span", "week-strip__block week-strip__block--rest", "Rest"),
    ])), { "aria-label": label });
  }

  // Today: a small row of seven markers.
  //   days: [{ short: "Mon", name: "Monday", state, today, href, onClick }]
  //   state: "done" | "training" | "rest" | "missed" | "offplan"
  // The marker's shape carries the state and the aria-label says it in words,
  // so color is never the only signal.
  const STATE_WORDS = {
    done: "workout done",
    training: "workout planned",
    rest: "rest day",
    missed: "missed",
    offplan: "trained something else",
  };
  function weekRow({ days, label = "This week" }) {
    const glyph = { done: () => icon("check", 16, 2.5), missed: () => icon("close", 14), rest: () => icon("minus", 14) };
    return el("ol", "week-row", days.map((day) => {
      const words = `${day.name}${day.today ? ", today" : ""}: ${STATE_WORDS[day.state]}`;
      const inner = [
        el("span", "week-row__letter", day.short),
        el("span", `week-row__mark week-row__mark--${day.state}`, glyph[day.state] ? glyph[day.state]() : null),
      ];
      const tag = day.href ? "a" : day.onClick ? "button" : "div";
      const node = el(tag, day.today ? "week-row__day is-today" : "week-row__day", inner, {
        "aria-label": words,
        href: day.href,
        type: tag === "button" ? "button" : null,
        role: tag === "div" ? "img" : null,
      });
      if (day.onClick) node.addEventListener("click", day.onClick);
      return el("li", "", node);
    }), { "aria-label": label });
  }

  // ---------------------------------------------------------------------
  // Lists, empty states, the pinned footer
  // ---------------------------------------------------------------------
  // A list card. rows: [{ title, subtitle, value, href, onClick }]
  function listCard(rows) {
    return el("ul", "card card--list", rows.map((row) => {
      const text = el("span", "list-row__text", [el("span", "list-row__title", row.title), row.subtitle && el("span", "list-row__sub", row.subtitle)]);
      const value = row.value && el("span", "list-row__value num", row.value);
      const tag = row.href ? "a" : row.onClick ? "button" : "div";
      const node = el(tag, "list-row", [text, value], { href: row.href, type: tag === "button" ? "button" : null });
      if (row.onClick) node.addEventListener("click", row.onClick);
      return el("li", "", node);
    }));
  }

  // A list card whose rows open to show more (the Plan tab's days).
  //   rows: [{ title, subtitle, value, detail: () => Node | null }]
  // A row with a `detail` is a button; its detail is built the first time it opens.
  function expandableList(rows) {
    return el("ul", "card card--list", rows.map((row) => {
      const chevron = icon("down", 20);
      chevron.classList.add("expand__chevron");
      const text = el("span", "list-row__text", [el("span", "list-row__title", row.title), row.subtitle && el("span", "list-row__sub", row.subtitle)]);
      const value = row.value && el("span", "list-row__value num", row.value);
      const head = row.detail
        ? el("button", "list-row expand__head", [text, value, chevron], { type: "button", "aria-expanded": "false" })
        : el("div", "list-row expand__head", [text, value]);
      const item = el("li", "expand", head);
      let body = null;
      if (row.detail) {
        head.addEventListener("click", () => {
          const opening = head.getAttribute("aria-expanded") !== "true";
          head.setAttribute("aria-expanded", String(opening));
          if (!body) { body = el("div", "expand__body", row.detail()); item.append(body); }
          body.hidden = !opening;
        });
      }
      return item;
    }));
  }

  // Rana, one line, one action (nothing logged yet, a load error...).
  function emptyState({ pose = "wave", text, actionLabel, onAction, href }) {
    return el("div", "empty", [
      rana(pose, 116),
      el("p", "empty__text", text),
      actionLabel && Rana.ui.button({ label: actionLabel, kind: "primary", onClick: onAction, href }),
    ]);
  }

  // The pinned bottom area: the primary button (and anything above it).
  // The page's <body> needs class="has-footer" so content leaves room for it.
  function footerBar(children) {
    return el("div", "footer-bar", el("div", "footer-bar__inner", children));
  }

  Object.assign(Rana.ui, {
    rana, interview, ranaTip,
    progress, levelBar, liftBar, restRow, stepsBar, topbar,
    optionGroup, chipGroup, stepChips,
    collapsible, videoSlot, muscleChips,
    field, doneToggle, setRow, setTable,
    weekStrip, weekRow, listCard, expandableList, emptyState, footerBar,
  });
})();
