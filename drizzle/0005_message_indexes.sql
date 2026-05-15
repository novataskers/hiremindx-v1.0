-- Add indexes for community_dms to eliminate full table scans
CREATE INDEX IF NOT EXISTS `idx_community_dms_conversation_key` ON `community_dms` (`conversation_key`);
CREATE INDEX IF NOT EXISTS `idx_community_dms_sender_id` ON `community_dms` (`sender_id`);
CREATE INDEX IF NOT EXISTS `idx_community_dms_receiver_id` ON `community_dms` (`receiver_id`);
CREATE INDEX IF NOT EXISTS `idx_community_dms_created_at` ON `community_dms` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_community_dms_is_read` ON `community_dms` (`is_read`);
-- Composite index for the most common query pattern: conversation + time
CREATE INDEX IF NOT EXISTS `idx_community_dms_convkey_created` ON `community_dms` (`conversation_key`, `created_at`);
