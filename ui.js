// Small UI helpers shared by several screens (loaded as a plain <script>,
// like every other module, and attached to the Rana namespace).
//
//   Rana.ui.numericField(input, { decimal })   a number-only text box
//   Rana.ui.prescription(slot, { showRest })    the "3 sets × 8-10 reps · RPE 8 (i)" line
//   Rana.ui.infoButton(key)                     a small (i) button that opens an explanation

window.Rana = window.Rana || {};

Rana.ui = (() => {
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
  // The explanations behind the (i) buttons
  // ---------------------------------------------------------------------
  // Plain language, written for a college student who has never heard the
  // term. The stat descriptions match how stats are earned in game.js
  // (computeStatPoints) but stay qualitative on purpose, so changing a
  // threshold there doesn't leave this text stale.
  const INFO = {
    rpe: {
      title: "RPE",
      subtitle: "Rate of Perceived Exertion",
      paragraphs: [
        "A 1–10 score for how hard a set felt, judged by how many more reps you could have done. It's how this plan tells you how heavy to go, without needing a number.",
      ],
      list: [
        ["10", "Nothing left. You couldn't do one more rep."],
        ["9", "About 1 rep left in the tank."],
        ["8", "About 2 reps left."],
        ["7", "About 3 reps left. Fast, easy-feeling reps."],
      ],
      footer: "Each exercise lists a target RPE. Pick a weight where your last rep of the last set feels about that hard. A half-point (like 8.5) means somewhere in between.",
    },
    STR: {
      title: "Strength",
      subtitle: "STR",
      paragraphs: [
        "How much force you can produce. It grows from heavy, low-rep sets of big lifts that work several joints at once, like squats, presses, rows and deadlifts.",
      ],
      footer: "Heavier work builds it fastest. The number after the arrow is your 12-week target if you follow the plan.",
    },
    AGI: {
      title: "Agility",
      subtitle: "AGI",
      paragraphs: [
        "Your control, balance and muscular endurance. It grows from single-arm and single-leg exercises (lunges, split squats, one-arm rows) and from higher-rep sets.",
      ],
      footer: "The number after the arrow is your 12-week target if you follow the plan.",
    },
    VIT: {
      title: "Vitality",
      subtitle: "VIT",
      paragraphs: [
        "Your total work capacity: how much training your body can handle. Every set you complete adds to it, with a bonus for hip-hinge and core work.",
      ],
      footer: "It's the stat that rewards simply doing the work. The number after the arrow is your 12-week target if you follow the plan.",
    },
    INT: {
      title: "Intelligence",
      subtitle: "INT",
      paragraphs: [
        "How well you follow the plan. It grows each time you finish a suggested workout as written, not from freestyle workouts.",
      ],
      footer: "Training smart beats training hard. The number after the arrow is your 12-week target if you follow the plan.",
    },
  };

  // ---------------------------------------------------------------------
  // The (i) button and its popover
  // ---------------------------------------------------------------------
  // One popover at a time, appended to <body> and positioned next to the
  // button, so it's never clipped by the notched panels it sits in. It
  // closes on a second tap, a tap elsewhere, Escape or scrolling.
  let open = null; // { button, pop }

  function closePopover(returnFocus) {
    if (!open) return;
    const { button, pop } = open;
    pop.remove();
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutsideClick);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    open = null;
    // preventScroll: moving focus must never scroll the page, because a scroll
    // closes the popover (and would close the next one the moment it opens).
    if (returnFocus) button.focus({ preventScroll: true });
  }
  function onOutsideClick(event) {
    if (open && !open.pop.contains(event.target) && !open.button.contains(event.target)) closePopover(false);
  }
  function onKeydown(event) {
    if (event.key === "Escape") closePopover(true);
  }
  // Scrolling moves the button out from under the popover, so it closes.
  // A resize (rotating the phone, the address bar sliding away) just moves it.
  function onScroll() {
    closePopover(false);
  }
  function onResize() {
    if (open) positionPopover(open.pop, open.button);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function buildPopover(info) {
    const pop = element("div", "info-pop");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", info.title);
    pop.tabIndex = -1;

    pop.appendChild(element("p", "eyebrow", info.subtitle));
    pop.appendChild(element("h3", "info-pop-title", info.title));
    info.paragraphs.forEach((text) => pop.appendChild(element("p", "info-pop-text", text)));

    if (info.list) {
      const list = element("dl", "info-pop-scale");
      info.list.forEach(([label, text]) => {
        const row = element("div");
        row.append(element("dt", "num", label), element("dd", "", text));
        list.appendChild(row);
      });
      pop.appendChild(list);
    }

    if (info.footer) pop.appendChild(element("p", "info-pop-footer", info.footer));

    const done = element("button", "info-pop-done", "Got it");
    done.type = "button";
    done.addEventListener("click", () => closePopover(true));
    pop.appendChild(done);
    return pop;
  }

  // Places the popover under the button (or above it if there's no room),
  // keeping it fully on screen, with a small caret pointing at the button.
  function positionPopover(pop, button) {
    const margin = 12;
    const rect = button.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;

    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin));
    const roomBelow = window.innerHeight - rect.bottom - margin;
    const above = roomBelow < height + 10 && rect.top - margin > height + 10;
    const top = above ? rect.top - height - 10 : rect.bottom + 10;

    pop.style.left = `${left}px`;
    // Always fully on screen, even on a short window or when the button is near an edge.
    pop.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    pop.style.setProperty("--caret-x", `${rect.left + rect.width / 2 - left}px`);
    pop.classList.toggle("info-pop--above", above);
  }

  function infoButton(key) {
    const info = INFO[key];
    const button = element("button", "info-btn", "i");
    button.type = "button";
    button.setAttribute("aria-label", `What is ${info.title}?`);
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (open && open.button === button) {
        closePopover(false);
        return;
      }
      closePopover(false);

      const pop = buildPopover(info);
      document.body.appendChild(pop);
      positionPopover(pop, button);
      button.setAttribute("aria-expanded", "true");
      open = { button, pop };
      document.addEventListener("click", onOutsideClick);
      document.addEventListener("keydown", onKeydown);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      pop.focus({ preventScroll: true });
    });
    return button;
  }

  // ---------------------------------------------------------------------
  // The prescription line: "3 sets × 8-10 reps · RPE 8 (i) · rest 120s"
  // ---------------------------------------------------------------------
  // Used by both the session detail and the logging screen, so the RPE
  // explanation is attached in exactly one place.
  function prescription(slot, { showRest = false } = {}) {
    const line = element("p", "slot-prescription");
    const num = (value) => element("span", "num", String(value));

    line.append(num(slot.working_sets), " sets × ", `${slot.rep_range} reps · RPE `, num(slot.target_rpe), infoButton("rpe"));
    if (showRest) line.append(" · rest ", num(slot.rest_seconds), "s");
    return line;
  }

  return { numericField, prescription, infoButton };
})();
