// Page-to-page transitions can be skipped for harmless reasons: the window
// was resized mid-fade, the page finished loading before the fade could
// start. The browser reports a skipped transition as an "Uncaught (in
// promise)" error in the console even though nothing is wrong. Handling the
// promises here keeps the console for real problems.
//
// Loaded in the <head> of every page (a plain script, not deferred), because
// the page-reveal event can fire before deferred scripts run.

function ignoreSkippedTransition(event) {
  const transition = event.viewTransition;
  if (!transition) return;
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
}

window.addEventListener("pagereveal", ignoreSkippedTransition);
window.addEventListener("pageswap", ignoreSkippedTransition);
