/**
 * Initialize webhook system
 * This should be called during app startup to register the webhook trigger
 */

import { setWebhookTrigger } from '@aidepedia/db/webhooks';
import { triggerWebhooks } from './webhooks';

export function initializeWebhooks() {
  setWebhookTrigger(triggerWebhooks);
}
