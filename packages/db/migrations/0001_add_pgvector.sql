-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create article_embeddings table
CREATE TABLE IF NOT EXISTS article_embeddings (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE UNIQUE,
  embedding VECTOR(1536) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS embedding_article_idx ON article_embeddings(article_id);
CREATE INDEX IF NOT EXISTS embedding_vector_idx ON article_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create search_analytics table
CREATE TABLE IF NOT EXISTS search_analytics (
  id SERIAL PRIMARY KEY,
  query VARCHAR(500) NOT NULL,
  search_type VARCHAR(20) NOT NULL DEFAULT 'keyword',
  results_count INTEGER NOT NULL DEFAULT 0,
  has_results BOOLEAN NOT NULL DEFAULT FALSE,
  filters JSONB,
  response_time_ms INTEGER,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for search analytics
CREATE INDEX IF NOT EXISTS search_analytics_query_idx ON search_analytics(query);
CREATE INDEX IF NOT EXISTS search_analytics_type_idx ON search_analytics(search_type);
CREATE INDEX IF NOT EXISTS search_analytics_has_results_idx ON search_analytics(has_results);
CREATE INDEX IF NOT EXISTS search_analytics_created_at_idx ON search_analytics(created_at);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for article_embeddings
CREATE TRIGGER update_article_embeddings_updated_at
    BEFORE UPDATE ON article_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
