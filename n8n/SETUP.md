# Hybrid n8n email automation

Import `clinic-hybrid-webhook-schedule.json` into n8n.

## What each trigger does

- **Instant Email Webhook** receives confirmation, rejection, patient
  cancellation, and doctor-leave cancellation events directly from the website.
- **Every 5 Minutes** cancels missed Pending appointments, creates next-day
  reminders, and drains any queued or previously failed emails.

Every email is stored in the database before webhook delivery. If n8n is
temporarily unavailable, the scheduled branch finds the queued email later, so
the message is not lost. Unique database keys prevent duplicate reminders and
status emails.

## Credentials

Create one n8n **Header Auth** credential:

- Header name: `Authorization`
- Header value: use the complete `Bearer ...` value from
  `Clinic_n8n_Credential.txt`

Attach it to:

- Instant Email Webhook
- Process Reminders and Missed Pending
- Fetch Queued and Failed Emails
- Mark Email Sent
- Mark Email Failed

Connect the clinic Gmail OAuth2 credential to **Send Email with Gmail**.

## Connect the website webhook

1. Save and activate the workflow.
2. Open **Instant Email Webhook** and copy its Production URL. It ends with
   `/webhook/clinic-instant-email`.
3. Configure that exact URL as the website environment variable
   `N8N_WEBHOOK_URL`.
4. Redeploy the website so the new environment revision is active.

## Test

1. Confirm a Pending appointment and verify the confirmation email is sent
   immediately through the Webhook branch.
2. Cancel an appointment and verify the cancellation email is sent immediately.
3. Execute the Schedule Trigger branch and verify reminders and expired Pending
   appointments are processed.
4. Confirm successful sends reach **Mark Email Sent**.
5. Temporarily disconnect Gmail and confirm failures reach **Mark Email Failed**
   and are retried by the scheduled branch, up to five attempts.
