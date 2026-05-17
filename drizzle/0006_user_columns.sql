ALTER TABLE `user` ADD COLUMN `phone` text;
ALTER TABLE `user` ADD COLUMN `last_seen` integer;
ALTER TABLE `user` ADD COLUMN `marketing_consent` integer NOT NULL DEFAULT 0;
ALTER TABLE `user` ADD COLUMN `marketing_consent_at` integer;
