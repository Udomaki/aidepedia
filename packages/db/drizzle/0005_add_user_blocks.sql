-- Migration: Add user_blocks table for user blocking feature
-- Issue: OC-104

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS user_block_blocker_idx ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS user_block_blocked_idx ON user_blocks(blocked_id);

-- Add comment for documentation
COMMENT ON TABLE user_blocks IS 'Stores user block relationships. When a user blocks another, their content is hidden from each other.';
