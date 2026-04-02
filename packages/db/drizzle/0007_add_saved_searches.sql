-- Add saved_searches table for user search management
CREATE TABLE IF NOT EXISTS saved_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  query TEXT NOT NULL,
  filters JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS saved_search_user_idx ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS saved_search_created_at_idx ON saved_searches(created_at);

-- Add comment
COMMENT ON TABLE saved_searches IS 'Stores user saved searches with filters for quick access';
COMMENT ON COLUMN saved_searches.filters IS 'JSON object containing filter options (category, dateFrom, tags, etc.)';
