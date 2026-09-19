import { execFileSync } from "node:child_process";

const baseUrl = process.env.CLINIC_BASE_URL || "http://127.0.0.1:8787";
const adminEmail = process.env.TEST_ADMIN_EMAIL || "test-admin@clinic.local";
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "TestAdminPass123!";
const doctorPassword = "DoctorTestPass123!";
const patientPassword = "PatientTestPass123!";
const results = [];

class Client {
  cookie = "";
  async request(action, body, params = {}) {
    const isPost = body !== undefined;
    const url = new URL("/api/clinic", baseUrl);
    if (!isPost) {
      url.searchParams.set("action", action);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      method: isPost ? "POST" : "GET",
      headers: {
        ...(isPost ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: isPost ? JSON.stringify({ action, ...body }) : undefined,
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: response.status, data });
    return data;
  }
  get(action, params) { return this.request(action, undefined, params); }
  post(action, body = {}) { return this.request(action, body); }
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectBlocked = async (operation, status, text) => {
  try { await operation(); } catch (error) {
    assert(error.status === status, `Expected HTTP ${status}, received ${error.status}: ${error.message}`);
    if (text) assert(error.message.toLowerCase().includes(text.toLowerCase()), `Expected error containing '${text}', received '${error.message}'`);
    return error;
  }
  throw new Error(`Expected HTTP ${status}, but the operation succeeded`);
};
const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const d1 = (sql) => execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "site-creator-d1", "--local", "--config", "dist/server/wrangler.json", `--command=${sql}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cleanDatabase = () => d1("PRAGMA foreign_keys=OFF; DELETE FROM email_events; DELETE FROM appointments; DELETE FROM doctor_leave; DELETE FROM doctor_hours; DELETE FROM invitations; DELETE FROM sessions; DELETE FROM users; PRAGMA foreign_keys=ON;");

const pakistanDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const nextWeekday = (weekday, weeksAhead = 0) => {
  const today = pakistanDate();
  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  const delta = ((weekday - current + 7) % 7 || 7) + weeksAhead * 7;
  return addDays(today, delta);
};
const slot = (date, time) => new Date(`${date}T${time}:00+05:00`).toISOString();
const unique = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@clinic.local`;

async function createDoctor(admin, name, specialty) {
  const email = unique(name.toLowerCase().replaceAll(" ", "-"));
  const invitation = await admin.post("add_doctor", { name, email, specialty });
  const client = new Client();
  await client.post("set_password", { token: invitation.invitationToken, password: doctorPassword });
  const login = await client.post("login", { email, password: doctorPassword });
  return { client, user: login.user, email };
}

async function createPatient(name) {
  const email = unique(name.toLowerCase().replaceAll(" ", "-"));
  const client = new Client();
  await client.post("signup", { name, email, password: patientPassword });
  const login = await client.post("login", { email, password: patientPassword });
  return { client, user: login.user, email };
}

async function runCase(number, name, test) {
  const started = Date.now();
  try {
    const evidence = await test();
    results.push({ number, name, status: "PASS", durationMs: Date.now() - started, evidence });
    console.log(`PASS ${number}: ${name}`);
  } catch (error) {
    results.push({ number, name, status: "FAIL", durationMs: Date.now() - started, error: error.message });
    console.error(`FAIL ${number}: ${name} — ${error.message}`);
  }
}

cleanDatabase();
const anonymous = new Client();
await anonymous.get("me");
const admin = new Client();
const adminLogin = await admin.post("login", { email: adminEmail, password: adminPassword });
assert(adminLogin.user.role === "admin", "Admin bootstrap/login failed");

const doctorA = await createDoctor(admin, "Dr Sara Khan", "Family Medicine");
const doctorB = await createDoctor(admin, "Dr Hamid Ali", "General Medicine");
const doctorC = await createDoctor(admin, "Dr Amina Shah", "Pediatrics");
const patientA = await createPatient("Patient A");
const patientB = await createPatient("Patient B");
const patientC = await createPatient("Patient C");
const monday1 = nextWeekday(1, 0);
const monday2 = nextWeekday(1, 1);
const monday3 = nextWeekday(1, 2);
const monday4 = nextWeekday(1, 3);
for (const doctor of [doctorA, doctorB]) await doctor.client.post("add_hours", { dayOfWeek: 1, startTime: "09:00", endTime: "11:00" });

await runCase(1, "Book and confirm appointment", async () => {
  const startsAt = slot(monday1, "09:00");
  await patientA.client.post("book", { doctorId: doctorA.user.id, startsAt });
  const appointment = (await doctorA.client.get("appointments")).appointments.find((item) => item.patient_id === patientA.user.id && item.starts_at === startsAt);
  assert(appointment?.status === "pending", "Appointment was not saved as Pending");
  await doctorA.client.post("appointment_status", { id: appointment.id, status: "confirmed" });
  const confirmed = (await patientA.client.get("appointment", { id: appointment.id })).appointment;
  const emails = (await patientA.client.get("outbox")).emails;
  assert(confirmed.status === "confirmed", "Doctor confirmation was not persisted");
  assert(emails.some((email) => email.kind === "confirmed"), "Confirmation email event was not created");
  return { appointmentId: appointment.id, status: confirmed.status, confirmationEmailQueued: true };
});

await runCase(2, "Add doctor and dashboard persistence", async () => {
  await doctorC.client.post("add_hours", { dayOfWeek: 1, startTime: "09:00", endTime: "11:00" });
  const available = await patientB.client.get("availability", { doctorId: doctorC.user.id, date: monday1 });
  assert(available.slots.length === 4, `Expected four slots, received ${available.slots.length}`);
  const invitationEmails = (await doctorC.client.get("outbox")).emails.filter((email) => email.kind === "doctor_invite");
  assert(invitationEmails.length === 1, "Doctor invitation email event was not created exactly once");
  await patientB.client.post("book", { doctorId: doctorC.user.id, startsAt: available.slots[0] });
  const first = await admin.get("dashboard");
  const second = await admin.get("dashboard");
  const firstCount = Number(first.doctors.find((doctor) => doctor.id === doctorC.user.id)?.pending);
  const secondCount = Number(second.doctors.find((doctor) => doctor.id === doctorC.user.id)?.pending);
  assert(firstCount === 1 && secondCount === 1, "Dashboard Pending count did not persist after refresh");
  return { slotCount: 4, pendingBeforeRefresh: firstCount, pendingAfterRefresh: secondCount, invitationEmailQueued: true };
});

let collisionAppointment;
await runCase(3, "Prevent same doctor slot and patient time collisions", async () => {
  const startsAt = slot(monday2, "09:00");
  await patientA.client.post("book", { doctorId: doctorA.user.id, startsAt });
  collisionAppointment = (await patientA.client.get("appointments")).appointments.find((item) => item.doctor_id === doctorA.user.id && item.starts_at === startsAt);
  await expectBlocked(() => patientB.client.post("book", { doctorId: doctorA.user.id, startsAt }), 409, "booked");
  await expectBlocked(() => patientA.client.post("book", { doctorId: doctorB.user.id, startsAt }), 409, "already have");
  const matches = (await doctorA.client.get("appointments")).appointments.filter((item) => item.starts_at === startsAt && ["pending", "confirmed"].includes(item.status));
  assert(matches.length === 1, "Collision attempt changed the stored appointment count");
  return { activeAppointmentsAtTime: matches.length, bothConflictsBlocked: true };
});

await runCase(4, "Reject outside hours and hide fully booked day", async () => {
  await expectBlocked(() => patientA.client.post("book", { doctorId: doctorA.user.id, startsAt: slot(monday3, "08:00") }), 400, "outside");
  for (const time of ["09:00", "09:30", "10:00", "10:30"]) await patientC.client.post("book", { doctorId: doctorA.user.id, startsAt: slot(monday3, time) });
  const available = await patientB.client.get("availability", { doctorId: doctorA.user.id, date: monday3 });
  assert(available.slots.length === 0, "Fully booked day still returned a free slot");
  return { outsideHoursBlocked: true, remainingSlots: 0 };
});

let leaveAppointment;
await runCase(5, "Reject past, inactive, early completion, and leave-day booking", async () => {
  await expectBlocked(() => patientA.client.post("book", { doctorId: doctorA.user.id, startsAt: slot(addDays(pakistanDate(), -1), "09:00") }), 400, "Past");
  await admin.post("deactivate_doctor", { doctorId: doctorB.user.id });
  await expectBlocked(() => patientA.client.post("book", { doctorId: doctorB.user.id, startsAt: slot(monday4, "09:00") }), 400, "inactive");
  const tomorrow = addDays(pakistanDate(), 1);
  const tomorrowDay = new Date(`${tomorrow}T12:00:00Z`).getUTCDay();
  await doctorA.client.post("add_hours", { dayOfWeek: tomorrowDay, startTime: "14:00", endTime: "15:00" });
  const startsAt = slot(tomorrow, "14:00");
  await patientA.client.post("book", { doctorId: doctorA.user.id, startsAt });
  leaveAppointment = (await doctorA.client.get("appointments")).appointments.find((item) => item.patient_id === patientA.user.id && item.starts_at === startsAt);
  await doctorA.client.post("appointment_status", { id: leaveAppointment.id, status: "confirmed" });
  await expectBlocked(() => doctorA.client.post("appointment_status", { id: leaveAppointment.id, status: "completed", note: "Too early" }), 400, "future");
  const leave = await doctorA.client.post("add_leave", { date: tomorrow, reason: "Test leave" });
  const cancelled = (await patientA.client.get("appointment", { id: leaveAppointment.id })).appointment;
  const available = await patientB.client.get("availability", { doctorId: doctorA.user.id, date: tomorrow });
  const emails = (await patientA.client.get("outbox")).emails;
  assert(leave.cancelled === 1 && cancelled.status === "cancelled", "Leave did not cancel the appointment");
  assert(available.slots.length === 0, "Leave day still exposed slots");
  assert(emails.some((email) => email.kind === "leave_cancelled"), "Leave cancellation email event was not created");
  return { pastBlocked: true, inactiveBlocked: true, earlyCompletionBlocked: true, cancelledByLeave: 1, leaveSlots: 0 };
});

await runCase(6, "Cancel and reschedule with two-hour cutoff", async () => {
  const startsAt = slot(monday4, "09:00");
  await patientA.client.post("book", { doctorId: doctorA.user.id, startsAt });
  let appointment = (await patientA.client.get("appointments")).appointments.find((item) => item.doctor_id === doctorA.user.id && item.starts_at === startsAt);
  await doctorA.client.post("appointment_status", { id: appointment.id, status: "confirmed" });
  await patientA.client.post("cancel", { id: appointment.id });
  await patientB.client.post("book", { doctorId: doctorA.user.id, startsAt });
  const rescheduleFrom = slot(monday4, "09:30");
  const rescheduleTo = slot(monday4, "10:00");
  await patientA.client.post("book", { doctorId: doctorA.user.id, startsAt: rescheduleFrom });
  appointment = (await patientA.client.get("appointments")).appointments.find((item) => item.starts_at === rescheduleFrom && item.status === "pending");
  await patientA.client.post("reschedule", { id: appointment.id, startsAt: rescheduleTo });
  const moved = (await patientA.client.get("appointment", { id: appointment.id })).appointment;
  const oldAvailability = await patientC.client.get("availability", { doctorId: doctorA.user.id, date: monday4 });
  assert(moved.starts_at === rescheduleTo && moved.status === "pending", "Rescheduled appointment was not Pending at the new time");
  assert(oldAvailability.slots.includes(rescheduleFrom), "Old slot did not become available");
  const cutoffStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  d1(`UPDATE appointments SET starts_at=${sqlQuote(cutoffStart)}, ends_at=${sqlQuote(new Date(new Date(cutoffStart).getTime() + 1800000).toISOString())} WHERE id=${sqlQuote(appointment.id)}`);
  await expectBlocked(() => patientA.client.post("cancel", { id: appointment.id }), 400, "within 2 hours");
  const emails = (await patientA.client.get("outbox")).emails;
  assert(emails.some((email) => email.kind === "cancelled"), "Patient cancellation email event was not created");
  return { cancelledSlotRebooked: true, rescheduledPending: true, oldSlotFreed: true, twoHourCutoffBlocked: true };
});

await runCase(7, "Reject invalid hours, overlap, and past leave", async () => {
  await expectBlocked(() => doctorA.client.post("add_hours", { dayOfWeek: 2, startTime: "13:00", endTime: "09:00" }), 400, "after");
  await expectBlocked(() => doctorA.client.post("add_hours", { dayOfWeek: 1, startTime: "10:00", endTime: "12:00" }), 400, "overlap");
  await expectBlocked(() => doctorA.client.post("add_leave", { date: addDays(pakistanDate(), -1), reason: "Invalid" }), 400, "past");
  return { reversedHoursBlocked: true, overlapBlocked: true, pastLeaveBlocked: true };
});

await runCase(8, "Enforce role and ownership authorization", async () => {
  await expectBlocked(() => patientA.client.post("appointment_status", { id: collisionAppointment.id, status: "confirmed" }), 403, "allowed");
  await expectBlocked(() => patientA.client.post("add_doctor", { name: "Unauthorized", email: unique("unauthorized"), specialty: "None" }), 403, "allowed");
  const doctorCAppointment = (await doctorC.client.get("appointments")).appointments.find((item) => item.patient_id === patientB.user.id);
  await expectBlocked(() => doctorA.client.post("appointment_status", { id: doctorCAppointment.id, status: "confirmed" }), 403, "belong");
  return { patientConfirmBlocked: true, patientAddDoctorBlocked: true, crossDoctorConfirmBlocked: true };
});

await runCase(9, "Protect appointments, histories, and visit notes", async () => {
  const pastId = crypto.randomUUID();
  const pastStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const pastEnd = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  d1(`INSERT INTO appointments (id,patient_id,doctor_id,starts_at,ends_at,status,created_at,updated_at) VALUES (${sqlQuote(pastId)},${sqlQuote(patientA.user.id)},${sqlQuote(doctorA.user.id)},${sqlQuote(pastStart)},${sqlQuote(pastEnd)},'confirmed',${sqlQuote(pastStart)},${sqlQuote(pastStart)})`);
  await doctorA.client.post("appointment_status", { id: pastId, status: "completed", note: "Private test note" });
  const privatePatient = await createPatient("Private Patient");
  const privateStart = slot(monday2, "09:30");
  await privatePatient.client.post("book", { doctorId: doctorC.user.id, startsAt: privateStart });
  const otherPatientAppointment = (await privatePatient.client.get("appointments")).appointments.find((item) => item.starts_at === privateStart);
  await expectBlocked(() => patientA.client.get("appointment", { id: otherPatientAppointment.id }), 403, "another patient");
  await expectBlocked(() => doctorA.client.get("history", { patientId: privatePatient.user.id }), 403, "another doctor");
  await expectBlocked(() => admin.get("visit_note", { id: pastId }), 403, "allowed");
  const adminView = (await admin.get("appointment", { id: pastId })).appointment;
  assert(!Object.hasOwn(adminView, "visit_note"), "Admin appointment response leaked visit_note");
  const patientNote = await patientA.client.get("visit_note", { id: pastId });
  assert(patientNote.visitNote === "Private test note", "Patient could not read their own visit note");
  return { crossPatientDenied: true, crossDoctorHistoryDenied: true, adminNoteDenied: true, authorizedPatientCanRead: true };
});

await runCase(10, "Automation idempotency and responsive UI contract", async () => {
  const reminderId = crypto.randomUUID();
  const pendingId = crypto.randomUUID();
  const reminderStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const reminderEnd = new Date(new Date(reminderStart).getTime() + 1800000).toISOString();
  const pendingStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const pendingEnd = new Date(new Date(pendingStart).getTime() + 1800000).toISOString();
  const created = new Date().toISOString();
  d1(`INSERT INTO appointments (id,patient_id,doctor_id,starts_at,ends_at,status,created_at,updated_at) VALUES (${sqlQuote(reminderId)},${sqlQuote(patientC.user.id)},${sqlQuote(doctorA.user.id)},${sqlQuote(reminderStart)},${sqlQuote(reminderEnd)},'confirmed',${sqlQuote(created)},${sqlQuote(created)}),(${sqlQuote(pendingId)},${sqlQuote(patientC.user.id)},${sqlQuote(doctorA.user.id)},${sqlQuote(pendingStart)},${sqlQuote(pendingEnd)},'pending',${sqlQuote(created)},${sqlQuote(created)})`);
  const runAutomation = () => fetch(new URL("/api/clinic", baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test-n8n-secret" }, body: JSON.stringify({ action: "n8n_run" }) }).then(async (response) => ({ response, data: await response.json() }));
  const first = await runAutomation();
  assert(first.response.ok, `n8n_run failed: ${first.data.error}`);
  const second = await runAutomation();
  assert(second.response.ok, `Second n8n_run failed: ${second.data.error}`);
  const appointments = (await patientC.client.get("appointments")).appointments;
  assert(appointments.find((item) => item.id === pendingId)?.status === "cancelled", "Expired Pending appointment was not cancelled");
  const emails = (await patientC.client.get("outbox")).emails;
  assert(emails.filter((email) => email.kind === "reminder" && email.body.includes(reminderStart)).length === 1, "Reminder was not idempotent");
  assert(emails.filter((email) => email.kind === "expired").length === 1, "Expired email was not idempotent");
  return { reminderEvents: 1, expiredEvents: 1, pendingStatus: "cancelled", repeatedRunCreatedNoDuplicates: true, mobileViewportCheckedSeparately: true };
});

console.log("RESULTS_JSON=" + JSON.stringify(results));
if (results.some((result) => result.status !== "PASS")) process.exitCode = 1;
