/**
 * Article Generation Service
 * Generates complete articles from structured outlines using OpenAI/Claude
 */

export interface ArticleOutline {
  title: string;
  sections: Array<{
    heading: string;
    points: string[];
    subsections?: Array<{
      heading: string;
      points: string[];
    }>;
  }>;
}

export interface GeneratedArticle {
  title: string;
  content: string;
  excerpt: string;
  citations: Array<{
    source: string;
    title?: string;
    authors?: string[];
    url?: string;
    citationText: string;
  }>;
}

export interface GenerationOptions {
  provider?: 'openai' | 'claude';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  citationFormat?: 'apa' | 'mla';
}

/**
 * Generate article from outline
 */
export async function generateArticleFromOutline(
  outline: ArticleOutline,
  options: GenerationOptions = {}
): Promise<GeneratedArticle> {
  const {
    provider = 'openai',
    model = provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022',
    temperature = 0.7,
    maxTokens = 4000,
    citationFormat = 'apa'
  } = options;

  const prompt = buildPrompt(outline, citationFormat);

  try {
    if (provider === 'openai') {
      return await generateWithOpenAI(prompt, model, temperature, maxTokens, citationFormat);
    } else {
      return await generateWithClaude(prompt, model, temperature, maxTokens, citationFormat);
    }
  } catch (error) {
    console.error('Article generation error:', error);
    throw new Error(`Failed to generate article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build prompt for article generation
 */
function buildPrompt(outline: ArticleOutline, citationFormat: 'apa' | 'mla'): string {
  const sectionsText = outline.sections.map(section => {
    let text = `\n## ${section.heading}\n`;
    section.points.forEach(point => {
      text += `- ${point}\n`;
    });
    if (section.subsections) {
      section.subsections.forEach(subsection => {
        text += `\n### ${subsection.heading}\n`;
        subsection.points.forEach(point => {
          text += `  - ${point}\n`;
        });
      });
    }
    return text;
  }).join('\n');

  return `You are an expert encyclopedia article writer. Generate a comprehensive, well-structured article based on the following outline.

# ${outline.title}

${sectionsText}

Requirements:
1. Write in an encyclopedic, neutral tone
2. Each section should be comprehensive and informative
3. Include factual information and cite sources where appropriate
4. Use proper markdown formatting (headings, lists, emphasis)
5. Add citations inline using the format: [1], [2], etc.
6. Include a "References" section at the end with all citations in ${citationFormat.toUpperCase()} format
7. The article should be between 1500-3000 words
8. Be accurate, neutral, and comprehensive

Output format:
Return a JSON object with:
{
  "title": "Article title",
  "content": "Full article content in markdown",
  "excerpt": "Brief 2-3 sentence summary",
  "citations": [
    {
      "source": "Source name",
      "title": "Source title",
      "authors": ["Author 1", "Author 2"],
      "url": "https://example.com",
      "citationText": "Full citation in ${citationFormat.toUpperCase()} format"
    }
  ]
}

Generate the article now:`;
}

/**
 * Generate article using OpenAI
 */
async function generateWithOpenAI(
  prompt: string,
  model: string,
  temperature: number,
  maxTokens: number,
  citationFormat: 'apa' | 'mla'
): Promise<GeneratedArticle> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert encyclopedia article writer. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content generated');
  }

  return JSON.parse(content) as GeneratedArticle;
}

/**
 * Generate article using Claude
 */
async function generateWithClaude(
  prompt: string,
  model: string,
  temperature: number,
  maxTokens: number,
  citationFormat: 'apa' | 'mla'
): Promise<GeneratedArticle> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  if (!content) {
    throw new Error('No content generated');
  }

  // Extract JSON from response (Claude might wrap it in markdown code blocks)
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || [null, content];
  const jsonContent = jsonMatch[1] || content;

  return JSON.parse(jsonContent) as GeneratedArticle;
}

/**
 * Estimate reading time (words / 200 words per minute)
 */
export function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}
