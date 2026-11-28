// Page boot: the one way every screen starts.
//
//   Rana.page.start({
//     requires: "active-plan",   // what must exist before this screen can show
//     tab: "today",              // which tab to highlight (omit on focused screens)
//     render(ctx) { ... },       // build the DOM from ctx; no fetching in here
//   });
//
// `requires`:
//   "none"         no questionnaire needed (the gallery, sign-up)
//   "profile"      questionnaire answers must exist, else go to the questionnaire
//   "plan"         a plan must exist (it can still be a draft, e.g. the plan reveal)
//   "active-plan"  a plan that has been locked in; a draft goes to the plan reveal
//
// `ctx` has everything a screen needs, already loaded:
//   data      the exercise library and its lookup maps (Rana.data)
//   profile   the questionnaire answers
//   plan      the active schedule
//   today     "YYYY-MM-DD"
//   sessions  finished sessions   (read on first use)
//   sets      finished sets       (read on first use)
//   ledger    the XP ledger: ctx.ledger() (worked out on first use, then reused)
//
// Doing this in one place is what keeps screens short, and what lets a
// screen render in its first frame: when the data is cached from an earlier
// screen, render() runs immediately instead of after a network wait.

window.Rana = window.Rana || {};

Rana.page = (() => {
  function buildContext(data, profile, plan) {
    let sessions = null;
    let sets = null;
    let ledger = null;
    return {
      data,
      profile,
      plan,
      today: Rana.plan.todayStr(),
      get sessions() {
        return (sessions ||= Rana.storage.getFinishedSessions());
      },
      get sets() {
        return (sets ||= Rana.storage.getFinishedSets());
      },
      // Everything about XP is replayed from the saved sets, never stored.
      ledger() {
        return (ledger ||= Rana.game.computeXpLedger(this.sets, this.sessions, plan, data));
      },
    };
  }

  // Where to send the visitor if the screen's requirement isn't met, or null.
  function redirectFor(requires, profile, plan) {
    if (requires === "none") return null;
    if (!profile) return "onboarding.html";
    if (requires === "profile") return null;
    if (!plan) return "onboarding.html";
    if (requires === "active-plan" && (plan.status === "draft" || !plan.start_date)) return "plan-reveal.html";
    return null;
  }

  function showError(error) {
    console.error(error);
    const host = document.querySelector("main") || document.body;
    host.replaceChildren(
      Rana.ui.emptyState({
        pose: "neutral",
        text: "Something didn't load. Reload and I'll try again.",
        actionLabel: "Reload",
        onAction: () => window.location.reload(),
      })
    );
  }

  function run(data, { requires = "plan", tab, render }) {
    try {
      let profile = null;
      let plan = null;
      if (requires !== "none") {
        // The saved plan may point at a split that was since removed from the
        // workbook; fix it before any screen reads it.
        Rana.plan.repairPlan(data);
        profile = Rana.storage.getProfile();
        plan = Rana.storage.getPlan();
        const to = redirectFor(requires, profile, plan);
        if (to) {
          window.location.replace(to);
          return;
        }
      }
      if (tab) Rana.nav.mount(tab);
      render(buildContext(data, profile, plan));
    } catch (error) {
      showError(error);
    } finally {
      delete document.body.dataset.loading;
      document.body.dataset.ready = "true";
      performance.mark("rana-ready"); // lets DevTools / tests see when the screen finished building
    }
  }

  function start(options) {
    const cached = Rana.data.peek();
    if (cached) {
      // The usual case after the first screen: render right now, then
      // check in the background that the cached library is still current.
      run(cached, options);
      Rana.data.revalidate();
      return;
    }
    // First screen of a tab: the body stays invisible until the content is
    // built, then fades in, so nothing is ever shown half-built.
    document.body.dataset.loading = "";
    Rana.data.load().then((data) => run(data, options), (error) => {
      delete document.body.dataset.loading;
      showError(error);
    });
  }

  return { start };
})();
