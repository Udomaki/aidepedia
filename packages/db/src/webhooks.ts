/**
 * Webhook trigger service for database operations
 * This module provides a decoupled way to trigger webhooks from database operations
 */

type WebhookTrigger = (event: string, data: any) => Promise<void>;

let webhookTrigger: WebhookTrigger | null = null;

/**
 * Set the webhook trigger function
 * This should be called once during app initialization
 */
export function setWebhookTrigger(trigger: WebhookTrigger) {
  webhookTrigger = trigger;
}

/**
 * Trigger a webhook event
 * Falls back to no-op if no trigger is registered
 */
export async function triggerWebhookEvent(event: string, data: any): Promise<void> {
  if (webhookTrigger) {
    try {
      await webhookTrigger(event, data);
    } catch (error) {
      // Don't fail the main operation if webhooks fail
      console.error('Webhook trigger error:', error);
    }
  }
}
