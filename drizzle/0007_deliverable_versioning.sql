-- Add version tracking columns to deliverables table
ALTER TABLE deliverables ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE deliverables ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 1;
ALTER TABLE deliverables ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
