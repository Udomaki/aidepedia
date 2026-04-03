import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

export interface ExportOptions {
  includeMetadata?: boolean;
  includeImages?: boolean;
  format?: 'pdf' | 'markdown' | 'json';
}

export interface ArticleData {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  categoryId?: number | null;
  tags?: string[] | null;
  status: string;
  authorId?: number | null;
  qualityScore?: number | null;
  viewCount?: number | null;
  upvotes?: number | null;
  downvotes?: number | null;
  readingTime?: number | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  publishedAt?: Date | string | null;
  author?: {
    name?: string | null;
    email?: string | null;
  } | null;
  category?: {
    name: string;
    slug: string;
  } | null;
  revisions?: any[];
}

/**
 * Export article as PDF
 */
export async function exportToPDF(article: ArticleData, options: ExportOptions = {}): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let yPosition = margin;

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(article.title, maxWidth);
  doc.text(titleLines, margin, yPosition);
  yPosition += titleLines.length * 10 + 10;

  // Metadata (if included)
  if (options.includeMetadata !== false) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);

    if (article.author?.name) {
      doc.text(`Author: ${article.author.name}`, margin, yPosition);
      yPosition += 6;
    }

    if (article.category?.name) {
      doc.text(`Category: ${article.category.name}`, margin, yPosition);
      yPosition += 6;
    }

    if (article.publishedAt) {
      doc.text(`Published: ${formatDate(article.publishedAt)}`, margin, yPosition);
      yPosition += 6;
    }

    if (article.readingTime) {
      doc.text(`Reading time: ${article.readingTime} min`, margin, yPosition);
      yPosition += 6;
    }

    if (article.viewCount) {
      doc.text(`Views: ${article.viewCount}`, margin, yPosition);
      yPosition += 6;
    }

    if (article.tags && article.tags.length > 0) {
      doc.text(`Tags: ${article.tags.join(', ')}`, margin, yPosition);
      yPosition += 6;
    }

    doc.setTextColor(0);
    yPosition += 10;
  }

  // Excerpt
  if (article.excerpt) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    const excerptLines = doc.splitTextToSize(article.excerpt, maxWidth);
    doc.text(excerptLines, margin, yPosition);
    yPosition += excerptLines.length * 6 + 10;
  }

  // Content
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  
  const paragraphs = article.content.split('\n\n');
  
  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, maxWidth);
    
    // Check if we need a new page
    if (yPosition + lines.length * 6 > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    
    doc.text(lines, margin, yPosition);
    yPosition += lines.length * 6 + 6;
  }

  // Footer with URL
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} - https://aidepedia.com/articles/${article.slug}`,
      margin,
      pageHeight - 10
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Export article as Markdown
 */
export async function exportToMarkdown(article: ArticleData, options: ExportOptions = {}): Promise<string> {
  let markdown = '';

  // YAML frontmatter (if metadata included)
  if (options.includeMetadata !== false) {
    markdown += '---\n';
    markdown += `title: "${escapeYaml(article.title)}"\n`;
    markdown += `slug: "${article.slug}"\n`;
    
    if (article.author?.name) {
      markdown += `author: "${escapeYaml(article.author.name)}"\n`;
    }
    
    if (article.category?.name) {
      markdown += `category: "${escapeYaml(article.category.name)}"\n`;
    }
    
    if (article.tags && article.tags.length > 0) {
      markdown += `tags: [${article.tags.map(t => `"${escapeYaml(t)}"`).join(', ')}]\n`;
    }
    
    if (article.publishedAt) {
      markdown += `published: "${formatDate(article.publishedAt)}"\n`;
    }
    
    if (article.readingTime) {
      markdown += `reading_time: ${article.readingTime}\n`;
    }
    
    if (article.viewCount) {
      markdown += `views: ${article.viewCount}\n`;
    }
    
    markdown += `source: https://aidepedia.com/articles/${article.slug}\n`;
    markdown += '---\n\n';
  }

  // Title
  markdown += `# ${article.title}\n\n`;

  // Excerpt
  if (article.excerpt) {
    markdown += `> ${article.excerpt}\n\n`;
  }

  // Content
  markdown += article.content;

  // Footer
  markdown += '\n\n---\n\n';
  markdown += `*Exported from [AIdepedia](https://aidepedia.com/articles/${article.slug})*\n`;

  return markdown;
}

/**
 * Export article as JSON
 */
export async function exportToJSON(article: ArticleData, options: ExportOptions = {}): Promise<string> {
  const exportData: any = {
    id: article.id,
    slug: article.slug,
    title: article.title,
    content: article.content,
    status: article.status,
    url: `https://aidepedia.com/articles/${article.slug}`,
    exportedAt: new Date().toISOString(),
  };

  if (article.excerpt) {
    exportData.excerpt = article.excerpt;
  }

  if (options.includeMetadata !== false) {
    exportData.metadata = {
      author: article.author?.name || null,
      category: article.category || null,
      tags: article.tags || [],
      qualityScore: article.qualityScore,
      viewCount: article.viewCount,
      upvotes: article.upvotes,
      downvotes: article.downvotes,
      readingTime: article.readingTime,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      publishedAt: article.publishedAt,
    };
  }

  if (article.revisions) {
    exportData.revisions = article.revisions;
  }

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export multiple articles as a ZIP file
 */
export async function exportBulk(
  articles: ArticleData[],
  format: 'pdf' | 'markdown' | 'json' = 'json',
  options: ExportOptions = {}
): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder('aidepedia-export');

  if (!folder) {
    throw new Error('Failed to create ZIP folder');
  }

  for (const article of articles) {
    let content: string | Buffer;
    let extension: string;

    switch (format) {
      case 'pdf':
        content = await exportToPDF(article, options);
        extension = 'pdf';
        break;
      case 'markdown':
        content = await exportToMarkdown(article, options);
        extension = 'md';
        break;
      case 'json':
      default:
        content = await exportToJSON(article, options);
        extension = 'json';
        break;
    }

    folder.file(`${article.slug}.${extension}`, content);
  }

  // Add manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    totalArticles: articles.length,
    format,
    articles: articles.map(a => ({
      slug: a.slug,
      title: a.title,
      url: `https://aidepedia.com/articles/${a.slug}`,
    })),
  };
  folder.file('manifest.json', JSON.stringify(manifest, null, 2));

  return await zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Helper functions
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
