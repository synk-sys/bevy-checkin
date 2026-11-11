# Event-day checklist

## The day before
- [ ] Run **Admin → Sync from Bevy**. Check that the attendee count matches the Bevy dashboard.
- [ ] Each desk: open the app, sign in, name the desk ("Desk 1", "Desk 2", …) and allow camera access.
- [ ] Test the badge printer: load 4×3″ stock, print one badge, and in the print dialog set margins to *None* and scale to 100%.
- [ ] Decide whether to use **Auto-print badge on check-in** (Admin → Desk settings).
- [ ] Train volunteers with demo data on a **separate** deployment, or locally. Don't load demo data into the real event.

## Doors open
- [ ] Re-sync from Bevy to pick up late registrations. This never changes check-ins already made at the desk.
- [ ] Keep the **Dashboard** open on a lead's laptop to watch queue speed and which desk is busiest.
- [ ] USB scanners: click into the search box once; after that every scan checks someone in automatically.

## At the desk
| You see | Do |
|---|---|
| 🟢 Welcome, Name! | Hand over the badge (or press **Print badge**). |
| 🟠 Already checked in | Their ticket was already used. Check the time and desk shown, then ask a lead if anything looks wrong. |
| 🔴 No ticket found | Search by name or email instead. If they're not registered, use **Walk-in**. |

Undoing a mistaken check-in is admin-only: **Attendees → ↶**.

## After the event
- [ ] **Attendees → Export CSV** to download the final attendance.
- [ ] Delete the attendee data once you no longer need it (**Admin → Reset all data**, which requires `ALLOW_DEMO_DATA=true`), or by deleting the `checkin_docs` table in Supabase.
