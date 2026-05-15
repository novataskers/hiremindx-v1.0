CREATE TABLE `community_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL UNIQUE,
	`user_type` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text,
	`headline` text,
	`location` text,
	`website` text,
	`skills` text,
	`hourly_rate` integer,
	`pricing_text` text,
	`availability` text,
	`work_experience` text,
	`cv_url` text,
	`portfolio_urls` text,
	`company_name` text,
	`company_description` text,
	`company_size` text,
	`industry` text,
	`payment_methods` text,
	`profile_complete` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `freelancer_portfolio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`image_url` text,
	`link_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `freelancer_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`price` integer NOT NULL,
	`delivery_days` integer NOT NULL,
	`image_url` text,
	`tags` text,
	`status` text NOT NULL DEFAULT 'active',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`budget` text NOT NULL,
	`deadline` text,
	`skills` text,
	`status` text NOT NULL DEFAULT 'open',
	`proposals` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`cover_letter` text NOT NULL,
	`bid_amount` text NOT NULL,
	`delivery_days` integer NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_dms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_key` text NOT NULL,
	`sender_id` text NOT NULL,
	`receiver_id` text NOT NULL,
	`message` text NOT NULL,
	`attachments` text,
	`project_id` integer,
	`proposal_id` integer,
	`is_read` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receiver_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
