-- Add reminder24hSent column to deliverables table
ALTER TABLE deliverables ADD COLUMN reminder_24h_sent INTEGER NOT NULL DEFAULT 0;
