# AI-Powered Content Suggestions - OC-85

This feature implements AI-powered content suggestions for AIdepedia, providing grammar checking, fact verification, quality scoring, and more.

## Features

### 1. Grammar & Style Checking
- **AI-Powered Checking:** Uses OpenAI GPT-4 to check grammar and style
- **Inline Suggestions:** Shows suggestions directly in the editor
- **One-Click Fixes:** Accept suggestions with a single click to apply changes
- **Style Guide:** Follows encyclopedic writing standards (neutral, clear, concise)

### 2. Fact Verification
- **Claim Detection:** Automatically identifies factual claims in articles
- **Cross-Reference:** Checks claims against reliable sources
- **Verification Status:** Marks claims as verified, unverified, disputed, or needs citation
- **Source Links:** Provides links to verification sources

### 3. Content Quality Scoring
- **AI Quality Score:** Generates a comprehensive quality score (0-100) for articles
- **Scoring Criteria:** Evaluates completeness, accuracy, readability, citations, and tone
- **Score Display:** Visual display of quality score on article pages
- **Improvement Suggestions:** Actionable suggestions to improve the score

### 4. Suggested Edits
- **AI Recommendations:** AI suggests improvements across multiple categories
- **Edit Types:** Grammar, clarity, completeness, citations, structure, and tone
- **Accept/Reject:** Review and accept or reject individual suggestions
- **Batch Apply:** Apply multiple suggestions at once (future enhancement)

### 5. Duplicate Detection
- **Similarity Scoring:** Detects similar or duplicate articles
- **Merge Suggestions:** Suggests merging highly similar articles
- **Redirect Handling:** Handles redirects for merged content

### 6. Tone Analysis
- **Tone Detection:** Ensures neutral, encyclopedic tone
- **Bias Detection:** Flags potential bias (political, commercial, cultural, etc.)
- **Tone Suggestions:** Provides specific suggestions for tone improvements

### 7. Citation Suggestions
- **Uncited Claims:** Identifies claims that need citations
- **Source Suggestions:** Suggests reliable sources for citations
- **Auto-Cite:** Generates citation format from provided URLs

## Technical Implementation

### Database Schema

New tables added to support AI features:

- `ai_suggestions`: Stores AI-generated suggestions (grammar, fact-check, tone, citations)
- `ai_quality_scores`: Stores quality scores and metrics for articles
- `duplicate_articles`: Tracks duplicate/similar article detection results
- `ai_usage`: Tracks API usage for rate limiting and cost management

### API Endpoints

All AI endpoints require authentication and are rate-limited.

#### Grammar & Style
- `POST /api/v1/ai/grammar` - Check grammar and style
  - Body: `{ articleId: number, content: string }`
  - Returns: `{ suggestions: GrammarSuggestion[] }`

#### Fact Verification
- `POST /api/v1/ai/fact-check` - Verify facts in content
  - Body: `{ articleId: number, content: string }`
  - Returns: `{ claims: FactCheckResult[] }`

#### Quality Scoring
- `POST /api/v1/ai/quality-score` - Calculate quality score
  - Body: `{ articleId: number }`
  - Returns: `{ qualityScore: QualityScore }`
- `GET /api/v1/ai/quality-score?articleId={id}` - Get existing quality score

#### Tone Analysis
- `POST /api/v1/ai/tone` - Analyze tone and bias
  - Body: `{ articleId: number, content: string }`
  - Returns: `{ toneAnalysis: ToneAnalysis }`

#### Citation Suggestions
- `POST /api/v1/ai/citations` - Get citation suggestions
  - Body: `{ articleId: number, content: string }`
  - Returns: `{ citations: CitationSuggestion[] }`

#### Duplicate Detection
- `POST /api/v1/ai/duplicates` - Detect duplicate articles
  - Body: `{ articleId: number }`
  - Returns: `{ duplicates: DuplicateResult[] }`
- `GET /api/v1/ai/duplicates?articleId={id}` - Get existing duplicate detection results

#### Suggested Edits
- `POST /api/v1/ai/suggestions` - Generate all suggested edits
  - Body: `{ articleId: number }`
  - Returns: `{ edits: SuggestedEdit[] }`
- `GET /api/v1/ai/suggestions?articleId={id}&status={status}` - Get suggestions
- `POST /api/v1/ai/suggestions/{id}/resolve` - Accept/reject/dismiss a suggestion
  - Body: `{ action: 'accept' | 'reject' | 'dismiss' }`

### Configuration

Add to your `.env` file:

```env
# AI Features (OpenAI)
OPENAI_API_KEY=your-openai-api-key-here
```

### Rate Limiting

- **Limit:** 30 requests per minute per user
- **Window:** 60 seconds
- **Enforcement:** In-memory rate limiting (can be upgraded to Redis for production)

### Cost Management

The `ai_usage` table tracks:
- Operation type
- Tokens used
- Estimated cost in cents
- Success/failure status

This enables monitoring and cost control.

### UI Components

1. **AISuggestions.astro** - Main component for displaying all AI suggestions
   - Tabbed interface for different suggestion types
   - "Run All Checks" button to trigger all AI features
   - Accept/Reject/Dismiss actions for each suggestion
   - Integrated quality score display

2. **QualityScoreDisplay.astro** - Visual quality score badge
   - Circular progress indicator
   - Detailed metrics breakdown
   - Article statistics
   - Top improvement suggestions

## Usage

### For Editors

1. Navigate to an article edit page
2. Click "Run All Checks" or manually trigger specific checks
3. Review AI suggestions in the suggestions panel
4. Accept, reject, or dismiss each suggestion
5. Accepted suggestions are automatically applied to the article

### For Developers

```typescript
import { checkGrammarAndStyle } from '@/lib/ai-service';

// Check grammar
const suggestions = await checkGrammarAndStyle(content, userId);

// Each suggestion has:
// - originalText: string
// - suggestedText: string
// - startOffset: number
// - endOffset: number
// - category: string
// - confidence: number (0-100)
// - reasoning: string
```

## Future Enhancements

1. **Batch Operations:** Accept/reject multiple suggestions at once
2. **Custom Rules:** Allow editors to define custom style rules
3. **Learning System:** Learn from accepted/rejected suggestions
4. **Multi-Language Support:** Extend to non-English content
5. **Real-Time Checking:** Live suggestions as you type
6. **Citation Auto-Complete:** Integrate with citation databases
7. **Plagiarism Detection:** Check for copied content
8. **Image Analysis:** Suggest improvements for images and captions

## Monitoring

Track AI feature usage via:

```sql
-- Recent AI operations
SELECT * FROM ai_usage 
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;

-- Cost by operation type
SELECT operation, 
       COUNT(*) as count,
       SUM(tokens_used) as total_tokens,
       SUM(cost_cents) as total_cost_cents
FROM ai_usage
WHERE success = true
GROUP BY operation;

-- Error rate
SELECT operation,
       COUNT(*) FILTER (WHERE success = false) * 100.0 / COUNT(*) as error_rate
FROM ai_usage
GROUP BY operation;
```

## Security Considerations

1. **API Key Protection:** OpenAI API key stored in environment variables
2. **Rate Limiting:** Prevents abuse and controls costs
3. **Authentication:** All endpoints require user authentication
4. **Input Validation:** All inputs are validated before processing
5. **Error Handling:** Errors are logged but don't expose sensitive information

## Performance

- **Async Processing:** All AI operations are asynchronous
- **Caching:** Results are cached in the database
- **Debouncing:** UI prevents rapid repeated requests
- **Timeout Handling:** API calls have reasonable timeouts

## Testing

Run tests with:

```bash
pnpm typecheck
pnpm lint:fix
pnpm build
```

## Support

For issues or questions:
1. Check the logs in the `ai_usage` table
2. Verify OpenAI API key is configured
3. Check rate limiting status
4. Review error messages in console

---

**Built with ❤️ for AIdepedia using OpenAI GPT-4**
