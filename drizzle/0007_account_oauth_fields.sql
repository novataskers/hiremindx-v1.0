-- Add missing OAuth fields to account table (better-auth passes scopes and tokenType via ...tokens spread)
ALTER TABLE `account` ADD COLUMN `scopes` text;
ALTER TABLE `account` ADD COLUMN `token_type` text;

-- Recreate unique index on user.email (was lost during table recreation)
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);
