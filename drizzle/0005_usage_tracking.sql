CREATE TABLE IF NOT EXISTS `usage_tracking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`feature` text NOT NULL,
	`count` integer NOT NULL DEFAULT 0,
	`last_used_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
