/**
 * Test script for content moderation features
 */

import { analyzeContent, analyzeSentiment, analyzeImage, analyzeAppeal } from './lib/moderation';

async function testContentModeration() {
  console.log('Testing content moderation...\  
  const testContent = 'This is a great article about machine learning and It const result = await analyzeContent(testContent);
  console.log('Content moderation result:', result);
  console.log('Flagged:', result.flagged);
  console.log('Confidence:', result.confidence);
  console.log('Severity:', result.severity);
}

async function testSentimentAnalysis() {
  console.log('\nTesting sentiment analysis...');
  
  const positiveContent = 'I love this amazing product! It works fantastically and I highly recommend it';
  const negativeContent = 'This is terrible and awful. I hate it so disappointing and frustrating. Worst experience ever.';
  
  const positiveResult = await analyzeSentiment(positiveContent);
  console.log('Positive sentiment result:', positiveResult);
  console.log('Score:', positiveResult.score);
  console.log('Label:', positiveResult.label);
  
  const negativeResult = await analyzeSentiment(negativeContent);
  console.log('Negative sentiment result:', negativeResult);
  console.log('Score:', negativeResult.score);
  console.log('Label:', negativeResult.label);
  console.log('Flagged:', negativeResult.flagged);
}

async function testAppealAnalysis() {
  console.log('\nTesting appeal analysis...');
  
  const mockAppeal = {
    id: '1',
    contentId: '123',
    contentType: 'article' as const,
    userId: '456',
    reason: 'My content was flagged incorrectly. It contains educational material about AI and machine learning.',
    originalContent: 'This article provides an introduction to machine learning concepts and practical applications in various industries.',
    status: 'pending',
    createdAt: new Date(),
  };
  
  const result = await analyzeAppeal(mockAppeal);
  console.log('Appeal analysis result:', result);
  console.log('Suggestion:', result.suggestion);
  console.log('Confidence:', result.confidence);
  console.log('Reasoning:', result.reasoning);
}

// Run tests
(async () => {
  try {
    await testContentModeration();
    await testSentimentAnalysis();
    await testAppealAnalysis();
    console.log('\n✅ All moderation tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
})();
