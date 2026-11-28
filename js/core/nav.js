// The bottom tab bar: Today, Plan, Progress, Profile. Screens don't include
// it themselves; Rana.page.start({ tab: "today" }) calls Rana.nav.mount()
// during the page's first render, so the bar is there from the first frame.
// It's left off the questionnaire, plan reveal, sign-up, the logging screen
// and the plan builder on purpose (omit `tab`): those are focused tasks, and
// a stray tap shouldn't pull you out mid-set.
//
// Pages that show the bar also put class="has-tabbar" on <body> in their
// HTML, so the space under the content is reserved before any script runs.

window.Rana = window.Rana || {};

Rana.nav = (() => {
  const TABS = [
    { key: "today", label: "Today", href: "today.html" },
    { key: "plan", label: "Plan", href: "plan.html" },
    { key: "progress", label: "Progress", href: "progress.html" },
    { key: "profile", label: "Profile", href: "profile.html" },
  ];

  function mount(active) {
    document.querySelector(".tabbar")?.remove();
    const links = TABS.map((tab) =>
      Rana.ui.el("a", "tabbar__tab", [Rana.icons.svg(tab.key), tab.label], {
        href: tab.href,
        "aria-current": tab.key === active ? "page" : null,
      })
    );
    const bar = Rana.ui.el("nav", "tabbar", Rana.ui.el("div", "tabbar__inner", links), { "aria-label": "Main" });
    document.body.append(bar);
    document.body.classList.add("has-tabbar"); // already set in the HTML; this is only a safety net
  }

  return { TABS, mount };
})();
