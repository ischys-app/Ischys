ALTER TABLE `settings` ADD `appearance` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
UPDATE `settings` SET `appearance` = 'dark';
