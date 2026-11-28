// Temporary: page two for the transition check. It also logs the browser's
// page-transition events and paint timing into sessionStorage so the check
// can read them after navigating.
const log = JSON.parse(sessionStorage.getItem("vt-log") || "[]");
window.addEventListener("pagereveal", (e) => {
  log.push({ page: "transition-test", event: "pagereveal", viewTransition: Boolean(e.viewTransition) });
  sessionStorage.setItem("vt-log", JSON.stringify(log));
});

Rana.page.start({
  requires: "none",
  tab: "today",
  render() {
    const { el, button } = Rana.ui;
    const main = document.getElementById("main");
    main.append(
      el("h1", "t-xl", "Page two"),
      Rana.ui.ranaTip("Same tab bar, same background. Nothing should blink."),
      Rana.ui.levelBar({ xp: 1840, level: 7, levelStartXp: 1584, nextLevelXp: 2156 }),
      button({ label: "Back to the gallery", kind: "primary", href: "docs/redesign/components.html" })
    );
  },
});

window.addEventListener("load", () => {
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  const ready = performance.getEntriesByName("rana-ready")[0];
  log.push({ page: "transition-test", fcp: fcp && Math.round(fcp.startTime), ready: ready && Math.round(ready.startTime) });
  sessionStorage.setItem("vt-log", JSON.stringify(log));
});
