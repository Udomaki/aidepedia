/**
 * Webhook delivery system for external integrations
 */

import { db } from '@aidepedia/db';
import { webhooks, webhook_deliveries } from '@aidepedia/db/schema';
import { eq } from '@aidepedia/db';
import crypto from 'crypto';

/**
 * Supported webhook events
 */
export type WebhookEvent =
  | 'article.created'
  | 'article.updated'
  | 'article.deleted'
  | 'comment.created'
  | 'comment.deleted'
  | 'user.followed';

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
}

/**
 * Delivery result
 */
export interface DeliveryResult {
  success: boolean;
  responseCode?: number;
  error?: string;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(secret: string, payload: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Deliver a webhook to a single endpoint with retry logic
 */
async function deliverWebhook(
  webhookId: number,
  url: string,
  secret: string,
  event: WebhookEvent,
  payload: WebhookPayload
): Promise<DeliveryResult> {
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(secret, payloadString);
  const maxAttempts = 3;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Timestamp': payload.timestamp,
        },
        body: payloadString,
      });

      if (response.ok) {
        return {
          success: true,
          responseCode: response.status,
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';

      // Wait before retry
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  return {
    success: false,
    error: lastError,
  };
}

/**
 * Trigger webhooks for a specific event
 */
export async function triggerWebhooks(
  event: WebhookEvent,
  data: any
): Promise<void> {
  try {
    // Get all enabled webhooks that subscribe to this event
    const enabledWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.enabled, true));

    const relevantWebhooks = enabledWebhooks.filter(wh =>
      wh.events.includes(event)
    );

    if (relevantWebhooks.length === 0) {
      return;
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Deliver to all webhooks in parallel
    const deliveryPromises = relevantWebhooks.map(async (webhook) => {
      // Create delivery record
      const [delivery] = await db
        .insert(webhook_deliveries)
        .values({
          webhookId: webhook.id,
          event,
          payload: payload as any,
          status: 'pending',
        })
        .returning();

      // Attempt delivery
      const result = await deliverWebhook(
        webhook.id,
        webhook.url,
        webhook.secret,
        event,
        payload
      );

      // Update delivery record
      await db
        .update(webhook_deliveries)
        .set({
          status: result.success ? 'success' : 'failed',
          responseCode: result.responseCode,
          deliveredAt: result.success ? new Date() : null,
        })
        .where(eq(webhook_deliveries.id, delivery.id));

      return result;
    });

    await Promise.all(deliveryPromises);
  } catch (error) {
    console.error('Webhook delivery error:', error);
    // Don't throw - webhook failures shouldn't break the main operation
  }
}

/**
 * Test a webhook endpoint
 */
export async function testWebhook(
  webhookId: number
): Promise<DeliveryResult> {
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1);

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testPayload: WebhookPayload = {
    event: 'article.created',
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      message: 'This is a test webhook delivery',
    },
  };

  return deliverWebhook(
    webhook.id,
    webhook.url,
    webhook.secret,
    'article.created',
    testPayload
  );
}
