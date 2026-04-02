-- Migration: Add API Keys and Usage Tracking
-- Description: Adds tables for API key management and usage analytics

-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(8) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'read-only' CHECK (type IN ('read-only', 'read-write', 'admin')),
  rate_limit INTEGER NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  total_requests INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for API keys
CREATE INDEX IF NOT EXISTS api_key_hash_idx ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_key_prefix_idx ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS api_key_user_idx ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_key_is_active_idx ON api_keys(is_active);

-- Create API usage tracking table
CREATE TABLE IF NOT EXISTS api_usage (
  id SERIAL PRIMARY KEY,
  api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  response_time INTEGER NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for API usage
CREATE INDEX IF NOT EXISTS api_usage_key_idx ON api_usage(api_key_id);
CREATE INDEX IF NOT EXISTS api_usage_endpoint_idx ON api_usage(endpoint);
CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage(created_at);

-- Create hourly API usage stats table
CREATE TABLE IF NOT EXISTS api_usage_hourly (
  id SERIAL PRIMARY KEY,
  api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  hour TIMESTAMP NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  success_requests INTEGER NOT NULL DEFAULT 0,
  error_requests INTEGER NOT NULL DEFAULT 0,
  avg_response_time INTEGER,
  max_response_time INTEGER,
  status_codes JSONB,
  top_endpoints JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for hourly usage stats
CREATE INDEX IF NOT EXISTS api_usage_hourly_key_hour_idx ON api_usage_hourly(api_key_id, hour);
CREATE INDEX IF NOT EXISTS api_usage_hourly_hour_idx ON api_usage_hourly(hour);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for api_keys table
DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
