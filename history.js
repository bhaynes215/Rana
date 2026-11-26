// Workout history: every finished workout, suggested and freestyle, newest
// first, grouped by month, with a filter for each kind.
//
// Nothing new is stored for this screen: it's just a different view of the
// session records (storage.js). The XP shown per workout comes from the
// same XP ledger as everywhere else (game.js), split per workout with
// Rana.game.xpForSession, so the rows always add up to your total.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function durationMinutes(session) {
  return Math.max(0, Math.round((new Date(session.finished_at) - new Date(session.started_at)) / 60000));
}

// One row: date block | name + details | XP earned. The whole row is a link
// to that workout's summary.
function buildRow(session, sets, xp, data) {
  const row = el("a", "history-row");
  row.href = `session-complete.html?session=${session.session_id}&from=history`;
  row.dataset.type = session.type;

  const date = new Date(session.date + "T00:00:00");
  const dateBlock = el("div", "history-date");
  dateBlock.append(
    el("span", "history-date-day num", String(date.getDate())),
    el("span", "history-date-dow", date.toLocaleDateString(undefined, { weekday: "short" }))
  );

  const body = el("div", "history-body");
  body.appendChild(el("span", "history-name", Rana.plan.sessionTitle(session, data)));

  const exercises = new Set(sets.map((s) => s.exercise_key)).size;
  const minutes = durationMinutes(session);
  const details = el("span", "history-details");
  details.appendChild(el("span", `history-tag history-tag--${session.type}`, session.type === "planned" ? "Suggested" : "Freestyle"));
  details.appendChild(
    el("span", "history-meta", [
      minutes > 0 ? `${minutes} min` : null,
      `${exercises} exercise${exercises === 1 ? "" : "s"}`,
      `${sets.length} set${sets.length === 1 ? "" : "s"}`,
    ].filter(Boolean).join(" · "))
  );
  body.appendChild(details);

  const xpEl = el("span", "history-xp num", `+${xp}`);
  xpEl.appendChild(el("span", "history-xp-unit", "XP"));

  row.append(dateBlock, body, xpEl);
  return row;
}

async function main() {
  const profile = Rana.storage.getProfile();
  const plan = Rana.storage.getPlan();
  if (!profile || !plan || plan.status !== "active") {
    window.location.href = "dashboard.html";
    return;
  }

  const data = await Rana.data.load();
  const sessions = Rana.storage.getFinishedSessions();
  const sets = Rana.storage.getFinishedSets();
  const ledger = Rana.game.computeXpLedger(sets, sessions, plan, data);

  const setsBySession = new Map();
  sets.forEach((s) => {
    const list = setsBySession.get(s.session_id) || [];
    list.push(s);
    setsBySession.set(s.session_id, list);
  });

  // Newest first: by date, then by start time within a day.
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.started_at.localeCompare(a.started_at));

  // --- Summary line ---
  const thisMonth = Rana.plan.todayStr().slice(0, 7); // "2026-11"
  const monthCount = ordered.filter((s) => s.date.startsWith(thisMonth)).length;
  document.getElementById("history-summary").textContent = ordered.length
    ? `${ordered.length} workout${ordered.length === 1 ? "" : "s"} · ${monthCount} this month · ${sets.length} sets logged`
    : "";

  const list = document.getElementById("history-list");

  function render(filter) {
    list.innerHTML = "";
    const shown = ordered.filter((s) => filter === "all" || s.type === filter);

    if (shown.length === 0) {
      const empty = el("div", "panel history-empty");
      empty.appendChild(el("p", "history-empty-title", ordered.length ? "Nothing here yet" : "No workouts yet"));
      empty.appendChild(
        el("p", "history-empty-text", ordered.length
          ? `You haven't finished any ${filter === "planned" ? "suggested" : "freestyle"} workouts yet.`
          : "Finish a workout and it shows up here, with every set and the XP it earned.")
      );
      list.appendChild(empty);
      return;
    }

    // Group by month, e.g. "November 2026".
    let currentMonth = null;
    let group = null;
    shown.forEach((session) => {
      const month = session.date.slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        const monthSessions = shown.filter((s) => s.date.startsWith(month)).length;
        const section = el("section", "history-month");
        const head = el("div", "history-month-head");
        head.append(
          el("h2", "eyebrow", new Date(month + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })),
          el("span", "panel-head-meta num", `${monthSessions} workout${monthSessions === 1 ? "" : "s"}`)
        );
        group = el("div", "panel history-group");
        section.append(head, group);
        list.appendChild(section);
      }
      group.appendChild(
        buildRow(session, setsBySession.get(session.session_id) || [], Rana.game.xpForSession(ledger, session), data)
      );
    });
  }

  // --- Filter buttons ---
  document.querySelectorAll(".segmented-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".segmented-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      render(btn.dataset.filter);
    });
  });

  render("all");
}

main();
