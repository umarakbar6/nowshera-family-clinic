# Nowshera Family Clinic

A production-oriented clinic appointment and patient management system built
for the AI Skool hackathon. It provides separate patient, doctor, and clinic
administrator workspaces backed by server-side authorization and Cloudflare D1.

## Technology

- Next.js 16, React 19, TypeScript, and Tailwind CSS
- Cloudflare Workers and D1
- Drizzle ORM migrations
- n8n webhook and scheduled email automation
- Gmail OAuth2 for outbound messages

## Run locally

Requirements: Node.js 22.13 or newer and pnpm 11.

1. Install dependencies with `pnpm install`.
2. Apply the SQL migrations from `drizzle/` to a D1 database.
3. Configure the D1 binding named `DB`.
4. Set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (minimum 12 characters),
   and optionally `INITIAL_ADMIN_NAME` for the first administrator.
5. Set `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` for automation.
6. Start the project with `pnpm dev`.

Never commit environment files, passwords, webhook secrets, invitation tokens,
or OAuth credentials. The included n8n JSON contains workflow structure only.

All appointment times are stored as UTC and displayed using Pakistan Standard Time. Email events are first stored in the durable outbox. The hybrid n8n workflow in `n8n/clinic-hybrid-webhook-schedule.json` sends confirmation and cancellation emails instantly by webhook, while its schedule handles reminders, missed Pending appointments, queued fallback delivery, and retries.

## Implemented rules

- 30 minute availability from doctor working hours
- Database-enforced doctor-slot and patient-time collision protection
- Past, outside-hours, inactive-doctor and leave-day validation
- Doctor confirmation/rejection and post-start completion/no-show
- Two-hour patient cancellation/reschedule cutoff
- Leave-day automatic cancellation
- Idempotent confirmation, cancellation and reminder email events
- Hybrid n8n webhook and scheduled Gmail automation with retries and delivery tracking
- Server-side patient, doctor and admin authorization
- Visit-note privacy: administrators never receive notes
- Responsive mobile and desktop interface

## n8n automation

Import `n8n/clinic-hybrid-webhook-schedule.json` and follow
`n8n/SETUP.md`. The webhook branch sends confirmation, rejection, and
cancellation messages immediately. The schedule branch creates reminders,
cancels expired Pending requests, drains the durable email queue, and retries
failed deliveries.

## Validation

```bash
pnpm build
```
