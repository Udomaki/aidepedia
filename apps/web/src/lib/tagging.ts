import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface TagSuggestion {
  tag: string;
  confidence: number; // 0-100
  isNew: boolean; // True if not in existing vocabulary
}

export interface CategorySuggestion {
  categoryId: number;
  categoryName: string;
  confidence: number; // 0-100
}

export interface TaggingResult {
  tags: TagSuggestion[];
  category?: CategorySuggestion;
}

/**
 * Analyze article content and suggest tags and category
 */
export async function suggestTagsAndCategory(
  title: string,
  content: string,
  excerpt: string | null,
  existingTags: string[] = [],
  categories: Array<{ id: number; name: string; description: string | null }> = []
): Promise<TaggingResult> {
  const prompt = `Analyze the following article and suggest relevant tags and a category.

Title: ${title}

Excerpt: ${excerpt || 'N/A'}

Content:
${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}

Existing tag vocabulary (prefer these if relevant):
${existingTags.length > 0 ? existingTags.join(', ') : 'None'}

Available categories:
${categories.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')}

Respond with a JSON object in this exact format:
{
  "tags": [
    {"tag": "tag-name", "confidence": 85, "isNew": false}
  ],
  "category": {"categoryId": 1, "categoryName": "Category Name", "confidence": 90}
}

Rules:
1. Suggest 5-10 relevant tags
2. Use existing tags from vocabulary when they fit well (isNew: false)
3. Suggest new tags if existing ones don't cover important topics (isNew: true)
4. Confidence scores should be 0-100 based on relevance
5. Pick the most appropriate category from the available categories
6. Tags should be lowercase, hyphenated (e.g., "machine-learning")
7. Focus on specific, meaningful tags rather than generic ones`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result: TaggingResult = JSON.parse(jsonMatch[0]);

    // Validate and sanitize the results
    result.tags = result.tags
      .filter(t => t.tag && typeof t.confidence === 'number')
      .map(t => ({
        tag: t.tag.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
        confidence: Math.min(100, Math.max(0, t.confidence)),
        isNew: Boolean(t.isNew),
      }))
      .slice(0, 10); // Max 10 tags

    if (result.category) {
      // Verify category exists
      const categoryExists = categories.find(c => c.id === result.category!.categoryId);
      if (!categoryExists) {
        delete result.category;
      } else {
        result.category.confidence = Math.min(100, Math.max(0, result.category.confidence));
      }
    }

    return result;
  } catch (error) {
    console.error('Error suggesting tags:', error);
    throw new Error('Failed to generate tag suggestions');
  }
}

/**
 * Generate slug from tag name
 */
export function generateTagSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
