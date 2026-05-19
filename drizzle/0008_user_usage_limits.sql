-- Add user_usage_limits table if it doesn't already exist (defensive migration)
CREATE TABLE IF NOT EXISTS `user_usage_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`deep_features_count` integer NOT NULL DEFAULT 0,
	`deep_features_reset_at` text,
	`outreach_features_count` integer NOT NULL DEFAULT 0,
	`outreach_features_reset_at` text,
	`community_count` integer NOT NULL DEFAULT 0,
	`deep_research_count` integer NOT NULL DEFAULT 0,
	`market_analysis_count` integer NOT NULL DEFAULT 0,
	`ai_prediction_count` integer NOT NULL DEFAULT 0,
	`canvas_coding_count` integer NOT NULL DEFAULT 0,
	`email_outreach_count` integer NOT NULL DEFAULT 0,
	`exam_questions_count` integer NOT NULL DEFAULT 0,
	`match_count` integer NOT NULL DEFAULT 0,
	`community_ai_count` integer NOT NULL DEFAULT 0,
	`community_post_count` integer NOT NULL DEFAULT 0,
	`attachment_count` integer NOT NULL DEFAULT 0,
	`attachment_reset_at` text,
	`chat_message_count` integer NOT NULL DEFAULT 0,
	`chat_message_reset_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_usage_limits_user_id_unique` ON `user_usage_limits` (`user_id`);
