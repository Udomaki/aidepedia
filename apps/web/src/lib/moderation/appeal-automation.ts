import { analyzeContent } from './ai-detection';
import { analyzeSentiment } from './sentiment-analysis';

export interface Appeal {
  id: string;
  contentId: string;
  contentType: 'article' | 'comment';
  userId: string;
  reason: string;
  originalContent: string;
  status: 'pending' | 'approved' | 'rejected';
  aiSuggestion?: 'approve' | 'reject';
  aiConfidence?: number;
  aiReasoning?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface AppealAnalysisResult {
  suggestion: 'approve' | 'reject';
  confidence: number;
  reasoning: string;
  factors: {
    contentModeration: {
      flagged: boolean;
      severity: string;
    };
    sentimentAnalysis: {
      score: number;
      flagged: boolean;
    };
    appealQuality: {
      length: number;
      hasExplanation: boolean;
      hasContext: boolean;
    };
  };
}

/**
 * Analyze an appeal and provide AI-assisted recommendation
 */
export async function analyzeAppeal(appeal: Appeal): Promise<AppealAnalysisResult> {
  try {
    // Analyze original content
    const moderationResult = await analyzeContent(appeal.originalContent);
    const sentimentResult = await analyzeSentiment(appeal.originalContent);

    // Analyze appeal reason
    const appealModeration = await analyzeContent(appeal.reason);
    const appealSentiment = await analyzeSentiment(appeal.reason);

    // Calculate factors
    const factors = {
      contentModeration: {
        flagged: moderationResult.flagged,
        severity: moderationResult.severity,
      },
      sentimentAnalysis: {
        score: sentimentResult.score,
        flagged: sentimentResult.flagged,
      },
      appealQuality: {
        length: appeal.reason.length,
        hasExplanation: appeal.reason.length > 50,
        hasContext: appeal.reason.length > 100,
      },
    };

    // Determine suggestion
    let suggestion: 'approve' | 'reject' = 'approve';
    let confidence = 0.5;
    const reasoningFactors: string[] = [];

    // Check if original content was flagged
    if (moderationResult.flagged) {
      if (moderationResult.severity === 'critical' || moderationResult.severity === 'high') {
        suggestion = 'reject';
        confidence = 0.85;
        reasoningFactors.push('Original content has severe moderation flags');
      } else if (moderationResult.severity === 'medium') {
        suggestion = 'reject';
        confidence = 0.65;
        reasoningFactors.push('Original content has moderate moderation flags');
      } else {
        reasoningFactors.push('Original content has minor moderation flags');
      }
    } else {
      reasoningFactors.push('Original content passed moderation checks');
    }

    // Check sentiment
    if (sentimentResult.flagged) {
      if (suggestion === 'approve') {
        suggestion = 'reject';
        confidence = 0.6;
      }
      reasoningFactors.push('Content has extremely negative sentiment');
    }

    // Check appeal quality
    if (factors.appealQuality.hasContext) {
      if (suggestion === 'approve') {
        confidence = Math.min(confidence + 0.15, 0.9);
      } else {
        confidence = Math.max(confidence - 0.1, 0.4);
      }
      reasoningFactors.push('Appeal provides good context');
    } else if (!factors.appealQuality.hasExplanation) {
      if (suggestion === 'reject') {
        confidence = Math.min(confidence + 0.1, 0.85);
      }
      reasoningFactors.push('Appeal lacks sufficient explanation');
    }

    // Check appeal content for spam/abuse
    if (appealModeration.flagged) {
      suggestion = 'reject';
      confidence = 0.9;
      reasoningFactors.push('Appeal contains inappropriate content');
    }

    // Check appeal sentiment
    if (appealSentiment.flagged) {
      confidence = Math.min(confidence + 0.1, 0.9);
      reasoningFactors.push('Appeal has negative tone');
    }

    const reasoning = reasoningFactors.join('. ') + '.';

    return {
      suggestion,
      confidence,
      reasoning,
      factors,
    };
  } catch (error) {
    console.error('Appeal analysis error:', error);
    return {
      suggestion: 'approve',
      confidence: 0.3,
      reasoning: 'Unable to analyze appeal automatically. Manual review recommended.',
      factors: {
        contentModeration: {
          flagged: false,
          severity: 'low',
        },
        sentimentAnalysis: {
          score: 0,
          flagged: false,
        },
        appealQuality: {
          length: appeal.reason.length,
          hasExplanation: appeal.reason.length > 50,
          hasContext: appeal.reason.length > 100,
        },
      },
    };
  }
}

/**
 * Track appeal success rate
 */
export interface AppealMetrics {
  totalAppeals: number;
  approvedAppeals: number;
  rejectedAppeals: number;
  pendingAppeals: number;
  approvalRate: number;
  averageProcessingTime: number; // in hours
  aiAccuracy: number; // percentage of AI suggestions that matched final decision
}

export function calculateAppealMetrics(appeals: Appeal[]): AppealMetrics {
  const totalAppeals = appeals.length;
  const approvedAppeals = appeals.filter(a => a.status === 'approved').length;
  const rejectedAppeals = appeals.filter(a => a.status === 'rejected').length;
  const pendingAppeals = appeals.filter(a => a.status === 'pending').length;

  const approvalRate = totalAppeals > 0 ? (approvedAppeals / totalAppeals) * 100 : 0;

  // Calculate average processing time
  const processedAppeals = appeals.filter(a => a.reviewedAt && a.createdAt);
  let averageProcessingTime = 0;
  
  if (processedAppeals.length > 0) {
    const totalTime = processedAppeals.reduce((sum, appeal) => {
      const processingTime = appeal.reviewedAt!.getTime() - appeal.createdAt.getTime();
      return sum + processingTime;
    }, 0);
    averageProcessingTime = (totalTime / processedAppeals.length) / (1000 * 60 * 60); // Convert to hours
  }

  // Calculate AI accuracy
  const aiAnalyzed = appeals.filter(a => a.aiSuggestion && a.status !== 'pending');
  let aiAccuracy = 0;
  
  if (aiAnalyzed.length > 0) {
    const correct = aiAnalyzed.filter(a => a.aiSuggestion === a.status).length;
    aiAccuracy = (correct / aiAnalyzed.length) * 100;
  }

  return {
    totalAppeals,
    approvedAppeals,
    rejectedAppeals,
    pendingAppeals,
    approvalRate,
    averageProcessingTime,
    aiAccuracy,
  };
}
