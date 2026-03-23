-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tienyxdafspakjjuhufb/sql

-- Key-value store for syncing app data across devices
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow all access (single user, no auth needed)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON app_data
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update timestamp on changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_data_updated
  BEFORE UPDATE ON app_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable realtime for live sync (optional but nice)
ALTER PUBLICATION supabase_realtime ADD TABLE app_data;
