ALTER TABLE `email_events` ADD `delivery_status` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_events` ADD `delivery_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_events` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `email_events` ADD `last_error` text;