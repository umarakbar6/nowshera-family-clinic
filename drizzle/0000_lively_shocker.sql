CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`visit_note` text,
	`cancel_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_appt_doctor_start` ON `appointments` (`doctor_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_appt_patient_start` ON `appointments` (`patient_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_appt_status_start` ON `appointments` (`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `doctor_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_hours_doctor_day` ON `doctor_hours` (`doctor_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `doctor_leave` (
	`id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`leave_date` text NOT NULL,
	`reason` text DEFAULT 'Leave' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_leave_doctor_date` ON `doctor_leave` (`doctor_id`,`leave_date`);--> statement-breakpoint
CREATE TABLE `email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`sent_at` text NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_events_dedupe_key_unique` ON `email_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_email_user` ON `email_events` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`specialty` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);