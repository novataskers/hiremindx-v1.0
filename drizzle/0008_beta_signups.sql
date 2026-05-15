CREATE TABLE `beta_signups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `signup_order` integer NOT NULL,
  `user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `stripe_customer_id` text,
  `stripe_subscription_id` text,
  `stripe_checkout_session_id` text,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` text NOT NULL
);

CREATE UNIQUE INDEX `beta_signups_email_unique` ON `beta_signups` (`email`);
