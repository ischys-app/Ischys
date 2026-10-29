CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`initials` text NOT NULL,
	`sort` integer NOT NULL,
	`is_owner` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`workout_count` integer DEFAULT 0 NOT NULL,
	`first_workout_at` integer,
	`last_workout_at` integer
);