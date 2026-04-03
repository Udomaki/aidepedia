# AI-Powered Semantic Search

AIdepedia now features AI-powered semantic search using OpenAI embeddings and PostgreSQL's pgvector extension.

## Features

### 1. Semantic Search
- **Vector Embeddings**: All articles are embedded using OpenAI's `text-embedding-3-small` model
- **Semantic Understanding**: Search understands context and meaning, not just keywords
- **Hybrid Search**: Combines semantic and keyword search for optimal results

### 2. Search Modes

#### Hybrid Mode (Default)
Combines semantic understanding with keyword matching:
- 70% semantic weight
- 30% keyword weight
- Best for general searches

#### Semantic Mode
Pure AI-powered search:
- Understands intent and context
- Great for conceptual searches
- Works even without exact keyword matches

#### Keyword Mode
Traditional text search:
- Exact keyword matching
- Fast and predictable
- Good for specific terms

### 3. Related Articles
Each article page shows semantically related articles based on:
- Content similarity
- Topic overlap
- Contextual relevance

### 4. Search Analytics
Track search performance and user behavior:
- Popular searches
- Zero-result searches
- Search success rates
- Response times

## Setup

### 1. Enable pgvector Extension

Run the migration to enable pgvector:

```bash
psql -d your_database -f packages/db/migrations/0001_add_pgvector.sql
```

### 2. Configure OpenAI API Key

Add your OpenAI API key to `.env`:

```bash
OPENAI_API_KEY=sk-...
```

### 3. Generate Embeddings

Generate embeddings for existing articles:

```bash
# Generate for all articles
pnpm run generate-embeddings

# Generate for specific article
pnpm run generate-embeddings --article-id=123

# Dry run to see what would be processed
pnpm run generate-embeddings --dry-run
```

## API Endpoints

### Search Articles
```
GET /api/v1/search?q=machine+learning&mode=hybrid
```

Query Parameters:
- `q`: Search query (required)
- `mode`: Search mode - `keyword`, `semantic`, or `hybrid` (default: `hybrid`)
- `category`: Filter by category slug
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)

### Get Related Articles
```
GET /api/v1/articles/[slug]/related?limit=5
```

Returns semantically similar articles.

### Generate Embeddings (Admin)
```
POST /api/v1/admin/embeddings
```

Body:
```json
{
  "articleId": 123,          // Single article
  "articleIds": [1, 2, 3],   // Multiple articles
  "all": true                // All published articles
}
```

### Search Analytics (Admin)
```
GET /api/v1/admin/search-analytics?period=week
```

Query Parameters:
- `period`: Time period - `day`, `week`, `month`, or `all` (default: `week`)
- `limit`: Number of top queries (default: 20)

## Performance

### Optimization
- **Embedding Cache**: Embeddings are stored in the database and reused
- **HNSW Index**: Uses Hierarchical Navigable Small World algorithm for fast similarity search
- **Batch Processing**: Generate embeddings for multiple articles efficiently
- **Rate Limiting**: 100ms delay between API calls to respect OpenAI limits

### Monitoring
Track performance via:
- Search analytics dashboard
- Response time tracking
- Coverage statistics

## Costs

### OpenAI API Pricing
- Model: `text-embedding-3-small`
- Cost: ~$0.02 per 1M tokens
- Average article: ~1,000 tokens (~$0.00002 per article)

### Example Costs
- 1,000 articles: ~$0.02
- 10,000 articles: ~$0.20
- 100,000 articles: ~$2.00

## Troubleshooting

### No Results from Semantic Search
1. Check if embeddings exist: `GET /api/v1/admin/embeddings/stats`
2. Generate embeddings: `pnpm run generate-embeddings`
3. Verify OpenAI API key is set

### Slow Search Performance
1. Verify HNSW index exists
2. Check database performance
3. Consider reducing result limit

### Embedding Generation Failures
1. Check OpenAI API key validity
2. Verify rate limits
3. Check article content length (max 8,000 chars)

## Future Enhancements

- [ ] Real-time embedding updates on article edits
- [ ] Personalized search based on user history
- [ ] Multi-language support
- [ ] Embedding visualization
- [ ] Advanced filtering by similarity threshold
