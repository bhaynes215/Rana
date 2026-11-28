# Rana — PRD addendum: Google Calendar sync (v2 candidate)

**Status:** DRAFT for review. Not approved. Nothing here is built.
**Date:** 2026-11-26
**Extends:** `rana-prd-v1-910`, decision D2 (no Google Calendar in v1)
**Owner decision needed:** this reverses D2 and moves Calendar from "later" to "next." Approve or reject before any build work starts.

---

## 1. Problem

Students plan their week in their calendar, not in a fitness app. A training plan that only lives inside Rana is easy to forget. If Rana's workouts appear as events next to classes and work, the plan becomes part of the schedule the student already checks.

## 2. Goal

A user can connect their Google Calendar and choose to have Rana's training days added as events, so their workouts show up alongside everything else in their week.

**Success looks like:** a student connects Google in under a minute, sees next week's workouts in Google Calendar within a few minutes, and never finds a duplicate or a stale event.

## 3. Non-goals

- Reading the user's other events to pick workout times. (Possible later, needs a separate privacy decision.)
- Automatically moving a workout to a free slot. This conflicts with D2's rule: a missed day is "missed," never silently rescheduled.
- Two-way sync of exercise results. Logging stays in Rana.
- Apple Calendar, Outlook, or other providers. Google only for now.
- Sharing calendars with other users. Social features stay out of v1 and this addendum.

## 4. Decisions proposed

| # | Proposal | Why |
|---|---|---|
| C1 | **Opt-in and off by default.** The user connects Google on purpose from Settings or the dashboard. | Nothing gets written to a calendar without a clear yes. |
| C2 | **Write to a dedicated "Rana" calendar** the app creates, not the user's main calendar. | The user can see, hide or delete all Rana events in one place, and nothing gets mixed into their own events. |
| C3 | **Events are created for scheduled training days only**, using the fixed weekly schedule from the plan. Rest days get no event. | Matches the plan's own data (`scheduled_session`). Rest days aren't training, so an event would be noise. |
| C4 | **Rana never moves or creates events on its own after the initial push** except to update the event for a session the user has changed in Rana (for example, a changed start time). | Keeps D2's "never silently rescheduled" rule. |
| C5 | **Deleting an event in Google means "skip this session,"** not "delete the plan." Rana shows that session as skipped and does not re-create it. | Avoids the app fighting the user. The user's choice wins. |
| C6 | **Event content:** title (e.g. "Rana · Push A"), start and end time, and a short description with the exercise list. No lift numbers, weight, bodyweight, or streak data in the event. | The calendar is shared with friends and family, and the privacy rules say lifts, bodyweight and streaks never leave the user's account. |
| C7 | **Disconnect removes the connection and asks whether to delete the Rana calendar's events.** | The user stays in control of what remains in their calendar after leaving. |

## 5. User flow

1. **Connect:** Settings → "Add workouts to Google Calendar" → Google sign-in → Google's permission screen → back in Rana, with a confirmation.
2. **Choose:** "Which times?" Default to the plan's usual start time, with an editable time per training weekday. Preview the next 7 days before anything is created.
3. **Push:** Rana creates the "Rana" calendar (if needed) and the events for the next 4 weeks. Show a count when done.
4. **Keep current:** each time the plan changes, Rana updates existing events and creates any missing ones within the window. Events are only changed on the owning account's request.
5. **Disconnect:** see C7.

## 6. Technical approach

This is the first feature that needs a server. Keep it as small as possible.

- **OAuth 2.0 with Google.** The browser sends the user to Google. Google sends back a short-lived code. A server exchanges that code for tokens. The client secret and the refresh token never reach the browser.
- **Scope:** `https://www.googleapis.com/auth/calendar.app.created` if it works for this case (lets the app manage only calendars it created). Otherwise `calendar.events`. Confirm which one covers C2 before building.
- **Backend:** a small serverless function or Supabase Edge Function, which the PRD already plans for. It holds tokens and does all Google API calls.
- **Data:** a new table, `calendar_connection` (user, provider, encrypted refresh token, calendar_id, status). A new table `calendar_event` (session_id, google_event_id, last_synced_at, status). Store the Google event ID so updates and deletes go to the right event. This keeps the data model clear of Calendar's details and easy to change later.
- **Sync job:** runs when the plan changes and once a day as a safety net. Sync is one-way (Rana → Google). It is idempotent: running it twice creates nothing extra.
- **Errors:** if Google is unreachable or a token is revoked, show a banner on the dashboard ("Calendar sync paused, reconnect"). Never fail silently.

## 7. Privacy and security

- Request the narrowest scope that works (see §6).
- Refresh tokens are encrypted at rest.
- The app asks Google only for calendar access, never for mail, contacts or Drive.
- Users can disconnect at any time (C7). Revoking access in Google's own settings also has to work and be handled.
- Put a short, plain-language note on the connect screen: what Rana writes, where, and how to remove it.
- Treat Google event data as user data: keep the privacy rule from §2 of the leveling doc (no lifts or bodyweight leave the account).

## 8. Costs

| Item | Expected cost | Notes |
|---|---|---|
| Google Calendar API | $0 | Free; limited by per-day quotas that a few hundred users won't reach. Confirm current quotas. |
| Google OAuth app verification | $0 cash, weeks of time | Before verification, only up to 100 test users, and they see an "unverified app" warning. Check whether this scope needs a security assessment; as of this draft, it's not expected to, but confirm. |
| Backend and database | $0 at early scale | Supabase or serverless free tiers. Paid tiers start around $20–25/month when needed. |
| Build time | Roughly 2–4 weeks of focused work | OAuth, backend, sync, error handling, tests. Largest real cost. |
| Ongoing | Small | Token expiry handling, Google API changes, and support for "why didn't my event update?" questions. |

## 9. Build plan (once approved)

1. Confirm the scope (§6) with a throwaway test against Google.
2. Build the backend OAuth round trip and store a connection. Verify with a test user.
3. Build the one-way push for the next 4 weeks, with idempotent updates. Test with the existing plan data in `scripts/test_leveling.js`-style tests.
4. Add the settings screen, connect/disconnect, and the sync-paused banner.
5. Submit the OAuth app for verification. Keep the test-user list small until it passes.

## 10. Open questions for the fitness expert and owner

1. **Default times:** should Rana guess a start time per workout, or should the user set one for each training weekday during connect?
2. **Rest days:** confirm no event on rest days (C3). Should there be an optional all-day "Rest" event instead?
3. **Event detail:** is the exercise list in the event description useful, or should it only say the workout name and link back to Rana? (Mind the privacy note in C6.)
4. **Window:** 4 weeks of events ahead, or the full 12-week plan at once?
5. **Skipped sessions:** when a user deletes an event in Google, is "skipped" the right record, or should Rana ask them why?
6. **Timing:** does this go after v1 launch, or does the owner want it in v1 after all? (D2 says v1; this addendum assumes after.)

## 11. Definition of done

- A user can connect, choose times, and see the next 4 weeks of Rana events in a "Rana" calendar.
- Changing a session in Rana updates its event; no duplicates after repeated syncs.
- Deleting an event in Google is respected and not recreated.
- Disconnect removes access and offers to clean up events.
- Tokens are never sent to the browser. Verified by reading network traffic in the browser's dev tools.
- Privacy note is shown on the connect screen, and no lift or bodyweight data appears in any event.
