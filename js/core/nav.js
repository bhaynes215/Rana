// The bottom tab bar: Home, Plan, History, Account. Any page that includes
// this script (with `defer`) gets the bar, so a change to the tabs is made in
// this one file. It's left off the questionnaire, results, sign-up, the
// logging screen and the plan builder on purpose: those are focused tasks,
// and a stray tap there shouldn't pull you out mid-set.
//
// The icons are small inline SVGs (no icon library), drawn with the current
// text color so the active tab's icon turns cyan along with its label.

window.Rana = window.Rana || {};

Rana.nav = (() => {
  const ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    plan: '<rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 14h3M13.5 14h3M7.5 17h3"/>',
    history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    account: '<circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c1.2-4 4.4-6 8-6s6.8 2 8 6"/>',
  };

  const TABS = [
    { key: "home", label: "Home", href: "dashboard.html" },
    { key: "plan", label: "Plan", href: "my-plan.html" },
    { key: "history", label: "History", href: "history.html" },
    { key: "account", label: "Account", href: "account.html" },
  ];

  // Which tab the current page belongs to.
  function currentTab() {
    const page = window.location.pathname.split("/").pop() || "dashboard.html";
    const from = new URLSearchParams(window.location.search).get("from");
    if (page === "my-plan.html") return "plan";
    if (page === "history.html") return "history";
    if (page === "account.html") return "account";
    if (page === "session-complete.html" && from === "history") return "history";
    return "home";
  }

  function draw() {
    // The summary right after finishing a workout is its own moment (the
    // XP animation); only its "logbook" version, opened from the history,
    // gets the bar.
    const page = window.location.pathname.split("/").pop();
    if (page === "session-complete.html" && new URLSearchParams(window.location.search).get("from") !== "history") return;

    const active = currentTab();
    const bar = document.createElement("nav");
    bar.className = "tabbar";
    bar.setAttribute("aria-label", "Main");
    TABS.forEach((tab) => {
      const link = document.createElement("a");
      link.className = "tabbar-tab";
      link.href = tab.href;
      if (tab.key === active) link.setAttribute("aria-current", "page");
      link.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square">${ICON[tab.key]}</svg>` +
        `<span>${tab.label}</span>`;
      bar.appendChild(link);
    });
    document.body.appendChild(bar);
    document.body.classList.add("has-tabbar"); // adds bottom padding so nothing hides under the bar
  }

  draw();
  return { TABS };
})();
