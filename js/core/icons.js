// Icons: one line-icon set on a 24 grid (1.75 stroke, round caps and joins,
// drawn in the current text color).
//
// They are inline SVG so there's no icon library and no extra request. The
// shapes follow Lucide (https://lucide.dev, ISC license); the core ones are
// the paths from the design handoff.
//
//   Rana.icons.svg("flame", { size: 18 })       an <svg> element
//   Rana.icons.html("flame", { size: 18 })      the same as an HTML string
//
// Pass `label` only when the icon stands alone and means something; icons
// next to text are decorative and get aria-hidden automatically.

window.Rana = window.Rana || {};

Rana.icons = (() => {
  const PATHS = {
    // Tabs
    today: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    plan: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    progress: '<path d="M4 4v16h16M8.5 16v-4M13 16V8M17.5 16v-6"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
    // Meaning
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.7-8.3.4 2 1.6 3.2 2.8 3.7C12.4 7.4 13.3 5 15 3c.6 3.4 3.5 5.9 3.5 10.6 0 4.4-2.9 7.4-6.5 7.4z"/>',
    dumbbell: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13M9.5 3h5"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4M12 8h.01"/>',
    // Actions
    back: '<path d="M15 18l-6-6 6-6"/>',
    forward: '<path d="M9 18l6-6-6-6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    minus: '<path d="M6 12h12"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="M15 5l4 4"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  };

  // `filled: true` draws a solid shape (the play button on the video slot).
  function html(name, { size = 24, stroke = 1.75, label = "", className = "", filled = false } = {}) {
    const body = PATHS[name];
    if (!body) throw new Error(`Unknown icon: ${name}`);
    const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
    const cls = className ? ` class="${className}"` : "";
    const fill = filled ? "currentColor" : "none";
    return (
      `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" ` +
      `stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`
    );
  }

  function svg(name, options) {
    const template = document.createElement("template");
    template.innerHTML = html(name, options);
    return template.content.firstElementChild;
  }

  return { html, svg, names: Object.keys(PATHS) };
})();
