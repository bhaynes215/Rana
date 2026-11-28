// UI primitives shared by every screen: building elements, buttons, page
// transitions, number-only fields, and the sheet (a panel that rises from the
// bottom). The visual components built on top of these (Rana, bubbles, bars,
// option cards, the set table...) are in components.js and extend the same
// `Rana.ui` object, so load this file first.
//
//   Rana.ui.el(tag, className, content, attrs)   build an element (see below)
//   Rana.ui.button({ label, kind, icon, href, onClick })
//   Rana.ui.iconButton({ icon, label, onClick })
//   Rana.ui.transition(update, { direction })     change the page with a smooth transition
//   Rana.ui.numericField(input, { decimal })      make a text box digits-only
//   Rana.ui.sheet({ title, content, actions })    a bottom sheet; returns { element, close, result }
//   Rana.ui.confirm({ message, confirmLabel })    an in-page "are you sure?"; resolves true or false
//   Rana.ui.infoButton("rpe")                     a small (i) that explains a term
//   Rana.ui.prescription(slot)                    "3 sets of 6–8 reps, RPE 8 (i), rest 2:30"
//   Rana.ui.format.clock(150) / .range("6-8") / .number(1840)
//
// Never use window.confirm / alert / prompt in this app: the Claude app's
// built-in browser blocks them and answers "no". Use confirm() and sheet().

window.Rana = window.Rana || {};

Rana.ui = (() => {
  // ---------------------------------------------------------------------
  // Building elements
  // ---------------------------------------------------------------------
  // el("p", "muted", "Hello")            a <p class="muted">Hello</p>
  // el("div", "card", [child1, child2])   children can be strings, nodes or arrays
  // el("button", "btn", "Go", { type: "button", "aria-label": "Go" })
  // `null`, `undefined` and `false` content/attributes are skipped, so
  // `cond && node` works inline.
  function append(parent, content) {
    if (content === null || content === undefined || content === false) return;
    if (Array.isArray(content)) content.forEach((c) => append(parent, c));
    else parent.append(content instanceof Node ? content : String(content));
  }

  function el(tag, className, content, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    append(node, content);
    if (attrs) {
      for (const [name, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        node.setAttribute(name, value === true ? "" : String(value));
      }
    }
    return node;
  }

  // ---------------------------------------------------------------------
  // Small formatters
  // ---------------------------------------------------------------------
  const format = {
    // 150 -> "2:30"
    clock(totalSeconds) {
      const s = Math.max(0, Math.round(totalSeconds));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    },
    // "6-8" -> "6–8" (a real en dash reads better than a hyphen)
    range(text) {
      return String(text).replace(/-/g, "–");
    },
    // 1840 -> "1,840"
    number(n) {
      return Number(n).toLocaleString("en-US");
    },
  };

  // ---------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------
  // kind: "primary" (one per screen, the bottom action), "secondary" (the
  // quieter path), "text" (an underlined opt-out), "action" (a header action
  // like Finish) or "plain" (a small inline action such as Add set).
  // Give `href` and you get a link that looks the same.
  function button({ label, kind = "primary", icon, href, onClick, compact = false, disabled = false, type = "button", ariaLabel }) {
    const classes = `btn btn--${kind}${compact ? " btn--compact" : ""}`;
    const node = href ? el("a", classes, null, { href }) : el("button", classes, null, { type });
    if (icon) node.append(Rana.icons.svg(icon, { size: 20 }));
    if (label) node.append(label);
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    if (disabled) node.disabled = true;
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  // A 44 x 44 button holding only an icon. `label` is required (it is the
  // button's accessible name, e.g. "Back" or "Exit workout").
  function iconButton({ icon, label, onClick, href, size = 24 }) {
    const node = href ? el("a", "btn btn--icon", null, { href }) : el("button", "btn btn--icon", null, { type: "button" });
    node.setAttribute("aria-label", label);
    node.append(Rana.icons.svg(icon, { size }));
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  // ---------------------------------------------------------------------
  // Page transitions
  // ---------------------------------------------------------------------
  // Runs `update` (which changes the page's content) inside a view
  // transition, so the old content crossfades into the new instead of
  // snapping. `direction` ("forward" | "back") adds a short slide, e.g.
  // exercise to exercise. Browsers without the feature, or people who asked
  // for reduced motion, just get the change instantly.
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function transition(update, { direction } = {}) {
    if (!document.startViewTransition || prefersReducedMotion()) {
      return Promise.resolve(update());
    }
    const root = document.documentElement;
    if (direction) root.dataset.vt = direction;
    const t = document.startViewTransition(update);
    t.ready.catch(() => {}); // a skipped transition is not an error
    return t.finished.catch(() => {}).finally(() => {
      delete root.dataset.vt;
    });
  }

  // ---------------------------------------------------------------------
  // Number-only fields
  // ---------------------------------------------------------------------
  // The logging boxes are plain text boxes that only accept digits, not
  // <input type="number">. A number input draws up/down arrows and changes
  // its value when you scroll the mouse wheel over it; neither is wanted
  // while logging a set, where you just type the number you lifted.
  // inputMode still brings up the numeric keypad on phones.
  //   decimal: true  → digits and one decimal point (weights, e.g. 102.5)
  //   decimal: false → digits only (reps)
  function numericField(input, { decimal = false } = {}) {
    input.type = "text";
    input.inputMode = decimal ? "decimal" : "numeric";
    input.autocomplete = "off";
    input.setAttribute("enterkeyhint", "done");

    // Strip anything that isn't allowed as it's typed or pasted, THEN limit the
    // length. (A maxlength attribute would cut pasted text to length first, so
    // "1a0b2.5.5" would lose its digits to the letters before being cleaned.)
    const maxLength = decimal ? 6 : 3; // 1000.5 lb, 999 reps
    input.addEventListener("input", () => {
      let value = input.value;
      if (decimal) {
        value = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
        const firstDot = value.indexOf(".");
        if (firstDot !== -1) value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, "");
      } else {
        value = value.replace(/[^0-9]/g, "");
      }
      value = value.slice(0, maxLength);
      if (value !== input.value) input.value = value;
    });
    return input;
  }

  // ---------------------------------------------------------------------
  // Sheet: a panel that rises from the bottom
  // ---------------------------------------------------------------------
  //   const s = Rana.ui.sheet({
  //     title: "Name your workout",
  //     content: someNode,                 // optional body
  //     actions: [{ label: "Start", value: "go", kind: "primary" },
  //               { label: "Cancel", value: null, kind: "secondary" }],
  //   });
  //   const answer = await s.result;       // the clicked action's value, or null if dismissed
  //
  // An action may have `onClick(close)` instead of closing by itself, e.g. to
  // check a form first and only call close(value) when it is valid. An action
  // with `autofocus: true` gets focus first (confirmations focus Cancel, so
  // pressing Enter never destroys anything). Escape and a tap on the dimmed
  // area dismiss the sheet unless `dismissible: false`.
  const openSheets = []; // the last one is on top and owns Escape and Tab
  let sheetCount = 0;

  // `className` adds a modifier to the panel (e.g. "sheet--tall" for the exercise picker);
  // `initialFocus: "panel"` focuses the sheet itself instead of its first control.
  function sheet({ title, subtitle, message, content, actions = [], dismissible = true, role = "dialog", label, className = "", initialFocus = "first" }) {
    const id = `sheet-${++sheetCount}`;
    const backdrop = el("div", "sheet-backdrop");
    const panel = el("div", `sheet ${className}`.trim(), null, { role, "aria-modal": "true", tabindex: "-1" });
    if (title) {
      panel.append(el("h2", "sheet__title", title, { id: `${id}-title` }));
      panel.setAttribute("aria-labelledby", `${id}-title`);
    } else {
      panel.setAttribute("aria-label", label || message || "Dialog");
    }
    if (subtitle) panel.append(el("p", "sheet__sub", subtitle));
    if (message) panel.append(el("p", "sheet__message", message));
    if (content) panel.append(content);

    let resolveResult;
    const result = new Promise((resolve) => { resolveResult = resolve; });
    const previousFocus = document.activeElement;
    let closed = false;

    function close(value = null) {
      if (closed) return;
      closed = true;
      resolveResult(value);
      openSheets.splice(openSheets.indexOf(api), 1);
      document.removeEventListener("keydown", onKeydown, true);
      if (!openSheets.length) document.body.classList.remove("sheet-open");
      backdrop.classList.remove("is-open");
      // Remove after the slide-out. With reduced motion there is no
      // transition to wait for, so remove it right away.
      if (prefersReducedMotion()) backdrop.remove();
      else {
        backdrop.addEventListener("transitionend", () => backdrop.remove(), { once: true });
        setTimeout(() => backdrop.remove(), 400); // safety net if the event never fires
      }
      if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    }

    let autofocusTarget = null;
    if (actions.length) {
      const bar = el("div", "sheet__actions");
      actions.forEach((action) => {
        const btn = button({ label: action.label, kind: action.kind || "secondary" });
        btn.addEventListener("click", () => (action.onClick ? action.onClick(close) : close(action.value === undefined ? null : action.value)));
        if (action.autofocus) autofocusTarget = btn;
        bar.append(btn);
      });
      panel.append(bar);
    }

    function focusables() {
      return Array.from(panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'));
    }
    function onKeydown(event) {
      if (openSheets[openSheets.length - 1] !== api) return; // only the top sheet reacts
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        event.stopPropagation();
        close(null);
      } else if (event.key === "Tab") {
        const list = focusables();
        if (!list.length) { event.preventDefault(); return; }
        const first = list[0];
        const last = list[list.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }

    backdrop.append(panel);
    if (dismissible) backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(null); });
    document.addEventListener("keydown", onKeydown, true);
    document.body.classList.add("sheet-open");
    document.body.append(backdrop);

    const api = { element: panel, close, result };
    openSheets.push(api);

    // Two steps so the slide-in actually animates: first paint closed, then open.
    void backdrop.offsetHeight;
    backdrop.classList.add("is-open");
    // initialFocus "panel" keeps a search box from popping the phone keyboard open.
    (autofocusTarget || (initialFocus === "panel" ? panel : focusables()[0]) || panel).focus({ preventScroll: true });
    return api;
  }

  // In-page confirmation (replaces window.confirm):
  //   if (await Rana.ui.confirm({ message: "Delete it?", confirmLabel: "Delete" })) { ... }
  // Resolves true on the confirm button; false on Cancel, Escape or a tap outside.
  function confirm({ title, message, confirmLabel = "Yes", cancelLabel = "Cancel" }) {
    return sheet({
      title,
      message,
      role: "alertdialog",
      actions: [
        { label: confirmLabel, value: true, kind: "primary" },
        { label: cancelLabel, value: false, kind: "secondary", autofocus: true },
      ],
    }).result.then((value) => value === true);
  }

  // ---------------------------------------------------------------------
  // The (i) button: explains a term in a sheet
  // ---------------------------------------------------------------------
  // Plain language, written for a college student who has never heard the term.
  const INFO = {
    rpe: {
      title: "RPE",
      subtitle: "Rate of Perceived Exertion",
      paragraphs: [
        "A 1–10 score for how hard a set felt, judged by how many more reps you could have done. It's how this plan tells you how heavy to go, without needing a number.",
      ],
      scale: [
        ["10", "Nothing left. You couldn't do one more rep."],
        ["9", "About 1 rep left in the tank."],
        ["8", "About 2 reps left."],
        ["7", "About 3 reps left. Fast, easy-feeling reps."],
      ],
      footer: "Each exercise lists a target RPE. Pick a weight where your last rep of the last set feels about that hard. A half-point (like 8.5) means somewhere in between.",
    },
  };

  function infoButton(key) {
    const info = INFO[key];
    const node = el("button", "info-btn", Rana.icons.svg("info", { size: 20 }), {
      type: "button",
      "aria-label": `What is ${info.title}?`,
      "aria-haspopup": "dialog",
    });
    node.addEventListener("click", () => {
      const body = el("div", "stack stack--tight");
      info.paragraphs.forEach((text) => body.append(el("p", "t-md", text)));
      if (info.scale) {
        const dl = el("dl", "scale");
        info.scale.forEach(([score, text]) => dl.append(el("div", "", [el("dt", "num", score), el("dd", "", text)])));
        body.append(dl);
      }
      if (info.footer) body.append(el("p", "t-sm muted", info.footer));
      sheet({ title: info.title, subtitle: info.subtitle, content: body, actions: [{ label: "Got it", kind: "primary" }] });
    });
    return node;
  }

  // ---------------------------------------------------------------------
  // The prescription line: "3 sets of 6–8 reps, RPE 8 (i), rest 2:30"
  // ---------------------------------------------------------------------
  // The one place this line is built, so the RPE explanation is attached once.
  function prescription(slot, { showRest = true } = {}) {
    const line = el("p", "t-sm muted");
    const num = (value) => el("span", "num", String(value));
    const sets = Number(slot.working_sets);
    line.append(`${sets} ${sets === 1 ? "set" : "sets"} of ${format.range(slot.rep_range)} reps`);
    if (slot.target_rpe !== undefined && slot.target_rpe !== null) line.append(", RPE ", num(slot.target_rpe), infoButton("rpe"));
    if (showRest && slot.rest_seconds) line.append(", rest ", num(format.clock(slot.rest_seconds)));
    return line;
  }

  return { el, append, format, button, iconButton, prefersReducedMotion, transition, numericField, sheet, confirm, infoButton, prescription };
})();
