#!/usr/bin/env node
// One-time database setup script for Beag's Brain cloud sync
//
// OPTION 1: Run via Supabase SQL Editor (easiest)
//   Go to: https://supabase.com/dashboard/project/tienyxdafspakjjuhufb/sql
//   Paste the contents of setup-db.sql and click "Run"
//
// OPTION 2: Run this script if you have the DB password
//   Set SUPABASE_DB_PASSWORD env var, then: node setup-db.js

const { Client } = require('pg');

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.log('No SUPABASE_DB_PASSWORD set.');
  console.log('');
  console.log('Easiest method: Run the SQL manually:');
  console.log('1. Go to https://supabase.com/dashboard/project/tienyxdafspakjjuhufb/sql');
  console.log('2. Paste the contents of setup-db.sql');
  console.log('3. Click "Run"');
  process.exit(0);
}

const SQL = `
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_data' AND policyname = 'Allow all access'
  ) THEN
    CREATE POLICY "Allow all access" ON app_data FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_data_updated ON app_data;
CREATE TRIGGER app_data_updated
  BEFORE UPDATE ON app_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE app_data;
`;

async function run() {
  // Try multiple pooler endpoints (region varies by project)
  const hosts = [
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-us-east-2.pooler.supabase.com',
    'aws-1-us-east-1.pooler.supabase.com',
  ];

  for (const host of hosts) {
    const client = new Client({
      host,
      port: 5432,
      database: 'postgres',
      user: 'postgres.tienyxdafspakjjuhufb',
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });

    try {
      await client.connect();
      console.log('Connected via ' + host);
      await client.query(SQL);
      console.log('Database setup complete!');
      await client.end();
      return;
    } catch(e) {
      try { await client.end(); } catch(_) {}
      console.log(host + ': ' + e.message);
    }
  }

  console.log('\nCould not connect. Use the SQL Editor instead:');
  console.log('https://supabase.com/dashboard/project/tienyxdafspakjjuhufb/sql');
}

run();
