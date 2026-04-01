-- Add performance monitoring tables
-- Migration: 0006_add_performance_monitoring

-- Slow query logs for tracking database queries exceeding threshold
CREATE TABLE IF NOT EXISTS slow_query_logs (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  duration INTEGER NOT NULL,
  endpoint VARCHAR(500),
  user_agent VARCHAR(500),
  ip_address VARCHAR(45),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for slow query logs
CREATE INDEX IF NOT EXISTS slow_query_duration_idx ON slow_query_logs(duration);
CREATE INDEX IF NOT EXISTS slow_query_endpoint_idx ON slow_query_logs(endpoint);
CREATE INDEX IF NOT EXISTS slow_query_created_at_idx ON slow_query_logs(created_at);

-- API performance tracking
CREATE TABLE IF NOT EXISTS api_performance (
  id SERIAL PRIMARY KEY,
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  response_time INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_agent VARCHAR(500),
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for API performance
CREATE INDEX IF NOT EXISTS api_performance_endpoint_idx ON api_performance(endpoint);
CREATE INDEX IF NOT EXISTS api_performance_response_time_idx ON api_performance(response_time);
CREATE INDEX IF NOT EXISTS api_performance_created_at_idx ON api_performance(created_at);

-- Add comment to document the purpose
COMMENT ON TABLE slow_query_logs IS 'Tracks database queries that exceed the slow query threshold (100ms)';
COMMENT ON TABLE api_performance IS 'Tracks API endpoint response times for performance monitoring';
