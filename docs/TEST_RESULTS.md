# Acceptance Test Results

Run date: 2026-09-19  
Environment: isolated local Cloudflare D1 database and local production build  
Suite: `tests/clinic-e2e.mjs`  
Result: **10 of 10 application acceptance cases passed**

No production patient records were used or modified. Unique test accounts and
an isolated local database were used for the run.

| # | Acceptance case | Result | Recorded evidence |
|---|---|---|---|
| 1 | Book and confirm appointment | PASS | Appointment persisted as Pending, doctor changed it to Confirmed, and one confirmation email event was queued. |
| 2 | Add doctor and dashboard | PASS | Invitation token flow worked, one invitation email event was queued, Monday 09:00–11:00 returned four slots, and dashboard Pending count stayed `1` after refresh. |
| 3 | Same slot or same time twice | PASS | Same doctor slot returned HTTP 409, same patient time returned HTTP 409, and only one active appointment remained. |
| 4 | Outside hours or fully booked | PASS | Direct outside-hours request was rejected and a fully booked day returned zero slots. |
| 5 | Past slot, inactive doctor, early completion, and leave | PASS | All three invalid operations were rejected; leave cancelled the confirmed appointment, removed the day's slots, and queued one leave-cancellation email event. |
| 6 | Cancel and reschedule | PASS | Cancelled slot was immediately rebookable, reschedule freed the old slot and reset status to Pending, cancellation event was queued, and the two-hour cutoff was enforced. |
| 7 | Wrong hours or leave day | PASS | Reversed hours, overlapping hours, and past leave were all rejected without persistence. |
| 8 | Wrong role | PASS | Patient confirm, patient add-doctor, and cross-doctor confirmation requests all returned HTTP 403 without changing records. |
| 9 | Private records | PASS | Cross-patient appointment, cross-doctor history, and admin visit-note access returned HTTP 403; admin appointment response contained no note; the authorized patient could read the note. |
| 10 | Automation and responsive UI contract | PASS | One reminder and one expired-Pending event were created, the Pending appointment became Cancelled, a repeated automation run created no duplicates, and the public page loaded with the required device-width viewport metadata. |

## Exact rerun output

```text
PASS 1: Book and confirm appointment
PASS 2: Add doctor and dashboard persistence
PASS 3: Prevent same doctor slot and patient time collisions
PASS 4: Reject outside hours and hide fully booked day
PASS 5: Reject past, inactive, early completion, and leave-day booking
PASS 6: Cancel and reschedule with two-hour cutoff
PASS 7: Reject invalid hours, overlap, and past leave
PASS 8: Enforce role and ownership authorization
PASS 9: Protect appointments, histories, and visit notes
PASS 10: Automation idempotency and responsive UI contract
```

## Important scope

- The suite validates backend rules, database persistence, role authorization,
  private-note filtering, email-event creation, automation idempotency, and the
  website's responsive viewport contract.
- Gmail is an external delivery provider. This run verified that exactly one
  durable email event was produced for each required action; it did not inspect
  a recipient's Gmail inbox.
- The public site was browser-smoke-tested and exposes
  `width=device-width, initial-scale=1`. A final visual check in Chrome's
  390-pixel device emulation remains recommended before hackathon submission.
