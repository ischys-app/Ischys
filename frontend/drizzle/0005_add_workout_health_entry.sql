ALTER TABLE `workouts` ADD `health_workout_uuid` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `health_workout_writer` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `pr_backfill_version` integer DEFAULT 0 NOT NULL;