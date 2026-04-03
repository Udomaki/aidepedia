#!/usr/bin/env tsx

/**
 * Script to generate embeddings for all published articles
 * 
 * Usage:
 *   pnpm run generate-embeddings
 *   pnpm run generate-embeddings --batch-size=10
 *   pnpm run generate-embeddings --article-id=123
 */

import { config } from 'dotenv';
config();

import { 
  listArticles, 
  generateArticleEmbedding, 
  getEmbeddingStats,
  batchGenerateEmbeddings 
} from '@aidepedia/db';

interface CliOptions {
  batchSize?: number;
  articleId?: number;
  dryRun?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--article-id=')) {
      options.articleId = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function main() {
  console.log('🚀 Starting embedding generation...\n');

  const options = parseArgs();

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in your .env file or export it:');
    console.error('  export OPENAI_API_KEY=your-key-here');
    process.exit(1);
  }

  try {
    // Get current stats
    console.log('📊 Current embedding statistics:');
    const statsBefore = await getEmbeddingStats();
    console.log(`   Total published articles: ${statsBefore.totalArticles}`);
    console.log(`   Articles with embeddings: ${statsBefore.articlesWithEmbeddings}`);
    console.log(`   Coverage: ${statsBefore.coverage.toFixed(2)}%\n`);

    if (options.dryRun) {
      console.log('🔍 Dry run mode - no embeddings will be generated');
      console.log('Run without --dry-run to generate embeddings');
      process.exit(0);
    }

    if (options.articleId) {
      // Generate embedding for single article
      console.log(`📝 Generating embedding for article ${options.articleId}...`);
      await generateArticleEmbedding(options.articleId);
      console.log('✅ Embedding generated successfully!\n');
    } else {
      // Generate embeddings for all articles
      console.log('📝 Generating embeddings for all published articles...');
      console.log('This may take a while depending on the number of articles.\n');

      const batchSize = options.batchSize || 10;
      console.log(`Batch size: ${batchSize}\n`);

      const results = await batchGenerateEmbeddings();
      
      console.log('\n✅ Embedding generation complete!\n');
      console.log('📊 Results:');
      console.log(`   Processed: ${results.processed}`);
      console.log(`   Failed: ${results.failed}`);
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
    }

    // Get final stats
    console.log('\n📊 Final embedding statistics:');
    const statsAfter = await getEmbeddingStats();
    console.log(`   Total published articles: ${statsAfter.totalArticles}`);
    console.log(`   Articles with embeddings: ${statsAfter.articlesWithEmbeddings}`);
    console.log(`   Coverage: ${statsAfter.coverage.toFixed(2)}%\n`);

    console.log('🎉 Done!');

  } catch (error) {
    console.error('❌ Error generating embeddings:', error);
    process.exit(1);
  }
}

main();
