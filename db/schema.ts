import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull().unique(), passwordHash: text("password_hash").notNull(), name: text("name").notNull(),
  role: text("role", { enum: ["patient", "doctor", "admin"] }).notNull(), specialty: text("specialty"), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [index("idx_sessions_user").on(t.userId)]);
export const doctorHours = sqliteTable("doctor_hours", {
  id: text("id").primaryKey(), doctorId: text("doctor_id").notNull().references(() => users.id, { onDelete: "cascade" }), dayOfWeek: integer("day_of_week").notNull(), startTime: text("start_time").notNull(), endTime: text("end_time").notNull(),
}, (t) => [index("idx_hours_doctor_day").on(t.doctorId, t.dayOfWeek)]);
export const doctorLeave = sqliteTable("doctor_leave", {
  id: text("id").primaryKey(), doctorId: text("doctor_id").notNull().references(() => users.id, { onDelete: "cascade" }), leaveDate: text("leave_date").notNull(), reason: text("reason").notNull().default("Leave"), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("uq_leave_doctor_date").on(t.doctorId, t.leaveDate)]);
export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(), patientId: text("patient_id").notNull().references(() => users.id), doctorId: text("doctor_id").notNull().references(() => users.id), startsAt: text("starts_at").notNull(), endsAt: text("ends_at").notNull(),
  status: text("status", { enum: ["pending", "confirmed", "completed", "no_show", "cancelled", "rejected"] }).notNull().default("pending"), visitNote: text("visit_note"), cancelReason: text("cancel_reason"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("idx_appt_doctor_start").on(t.doctorId, t.startsAt),
  index("idx_appt_patient_start").on(t.patientId, t.startsAt),
  index("idx_appt_status_start").on(t.status, t.startsAt),
  uniqueIndex("uq_active_doctor_slot").on(t.doctorId, t.startsAt).where(sql`status IN ('pending','confirmed')`),
  uniqueIndex("uq_active_patient_time").on(t.patientId, t.startsAt).where(sql`status IN ('pending','confirmed')`),
]);
export const emailEvents = sqliteTable("email_events", {
  id: text("id").primaryKey(), appointmentId: text("appointment_id").references(() => appointments.id, { onDelete: "cascade" }), userId: text("user_id").notNull().references(() => users.id), kind: text("kind").notNull(), subject: text("subject").notNull(), body: text("body").notNull(), dedupeKey: text("dedupe_key").notNull().unique(), sentAt: text("sent_at").notNull(),
  deliveryStatus: text("delivery_status", { enum: ["queued", "sent", "failed"] }).notNull().default("queued"),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  deliveredAt: text("delivered_at"),
  lastError: text("last_error"),
}, (t) => [index("idx_email_user").on(t.userId, t.sentAt)]);
export const invitations = sqliteTable("invitations", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), expiresAt: text("expires_at").notNull(), usedAt: text("used_at"), createdAt: text("created_at").notNull(),
});
