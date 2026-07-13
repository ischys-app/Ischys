CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `exercise_secondary_muscles` (
	`exercise_id` text NOT NULL,
	`muscle_id` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `muscle_id`)
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`initials` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'weighted' NOT NULL,
	`equipment` text DEFAULT 'other' NOT NULL,
	`category_id` text,
	`primary_muscle_id` text,
	`how_to_steps` text,
	`source` text,
	`external_id` text,
	`is_custom` integer DEFAULT 0 NOT NULL,
	`image_url` text,
	`image_author` text,
	`demo_url` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `muscles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `muscles_name_unique` ON `muscles` (`name`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`exercise_id` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`display` text DEFAULT '' NOT NULL,
	`achieved_at` integer,
	`workout_set_id` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`rest_seconds` integer DEFAULT 120 NOT NULL,
	`note` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'normal' NOT NULL,
	`target_weight` real,
	`target_reps` integer,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`initials` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`unit` text DEFAULT 'kg' NOT NULL,
	`auto_start_rest_timer` integer DEFAULT 1 NOT NULL,
	`rest_timer_alerts` integer DEFAULT 1 NOT NULL,
	`haptic_feedback` integer DEFAULT 1 NOT NULL,
	`server_url` text,
	`last_synced_at` integer,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`rest_seconds` integer DEFAULT 120 NOT NULL,
	`note` text,
	`superset_group` integer,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'normal' NOT NULL,
	`weight` real,
	`reps` integer,
	`done` integer DEFAULT 0 NOT NULL,
	`is_pr` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`routine_id` text,
	`name` text DEFAULT 'Workout' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`notes` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`total_volume` real DEFAULT 0 NOT NULL,
	`total_sets` integer DEFAULT 0 NOT NULL,
	`pr_count` integer DEFAULT 0 NOT NULL,
	`avg_hr` integer,
	`max_hr` integer,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
