# Reschedule & Booking-Status Plan

Client-facing booking status + a discreet self-serve reschedule *request*, plus an
owner-side management view. Calendar stays the source of truth; the Sheet keeps
mirroring it.

## Design decisions

1. **A client reschedule is a *request*, never an auto-move.** The Calendar event
   does not move until the owner approves. Keeps the existing "PENDING until the
   artist confirms" model and prevents double-booking.
2. **The pending proposal lives on the Calendar event** as a private extended
   property (`extendedProperties.private.rescheduleRequest = "YYYY-MM-DD|HH:MM"`).
   The Sheet sync rebuilds from the Calendar, so the proposal must live on the
   event to survive a sync.
3. **Owner page = one shared password** (`OWNER_DASHBOARD_PASSWORD`), constant-time
   compared — same posture as `CRON_SECRET`. No user accounts.
4. **Discreet by design:** the reschedule option is a small gray text link at the
   bottom of the client page ("Need to change your date?"), with one soft
   commitment line — not a button.

## Reused building blocks

- Token scheme: `approveToken` (HMAC-SHA256 of eventId with `CRON_SECRET`).
- Tokenized HTML handlers: `api/confirm.js`, `api/decline.js`.
- Calendar layer: `book.js` (`parseEventToBooking`, `listCalendarBookings`, ...).
- Email components: `email.js` (`shell`, `heroBanner`, `detailRow`, `ctaButton`).

## Phases

### Phase 1 — Client status page (view only)
- `book.js`: add `getBooking(eventId)`.
- `email.js`: add `clientStatusHtml(b)`; add discreet status link into the
  confirmation email.
- New `api/status.js`: `/api/status?eventId=…&token=…`, renders a branded status
  page (Pending / Confirmed / Cancelled / Reschedule requested).
- Wire `/api/status` into `api-dev-server.js`.

### Phase 2 — Discreet client reschedule request
- New `api/reschedule-request.js`: client proposes a date → writes the extended
  property, flips Sheet Status to `RESCHEDULE REQUESTED`, emails the owner. Does
  NOT move the event.
- `email.js` / `notify.js`: `rescheduleRequestHtml()` owner email with approve/
  decline-new-date links.
- Status page gains the discreet "Request a new date" flow.

### Phase 3 — Owner management page
- New `api/owner.js` (password-gated) + small front-end: upcoming events
  soonest-first, requests pinned on top. Actions: Confirm, Cancel, Reschedule
  (manual), Approve/Decline a client request.

## New env vars
- `OWNER_DASHBOARD_PASSWORD` (Phase 3). Everything else reuses existing config.
