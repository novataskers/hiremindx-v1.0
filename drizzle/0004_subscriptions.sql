CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL UNIQUE,
	`plan_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`currency` text NOT NULL DEFAULT 'GBP',
	`amount` integer NOT NULL,
	`interval` text NOT NULL DEFAULT 'month',
	`stripe_customer_id` text UNIQUE,
	`stripe_subscription_id` text UNIQUE,
	`stripe_checkout_session_id` text UNIQUE,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer NOT NULL DEFAULT 0,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
