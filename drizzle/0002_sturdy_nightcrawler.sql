CREATE TABLE `cv_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`resume_id` integer,
	`full_name` text,
	`email` text,
	`phone` text,
	`skills` text,
	`expertise` text,
	`job_titles` text,
	`experience_years` integer,
	`education` text,
	`summary` text,
	`raw_text` text,
	`analyzed_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`lead_id` integer,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` text,
	`opened_at` text,
	`replied_at` text,
	`reply_content` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`company_name` text NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`company_website` text,
	`industry` text,
	`location` text,
	`company_size` text,
	`match_score` integer,
	`match_reason` text,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
