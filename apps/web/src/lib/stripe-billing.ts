/**
 * Stripe Billing Integration
 * OC-124: API Monetization - Stripe integration for payments
 */

import Stripe from 'stripe';
import { db, eq } from '@aidepedia/db';
import { billing_plans, subscriptions, payments, users } from '@aidepedia/db/schema';

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

/**
 * Create or get Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(userId: number, email: string, name?: string): Promise<string> {
  // Check if user already has a subscription with a Stripe customer ID
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  
  if (existingSub?.stripeCustomerId) {
    return existingSub.stripeCustomerId;
  }
  
  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId: userId.toString()
    }
  });
  
  return customer.id;
}

/**
 * Create a subscription for a user
 */
export async function createSubscription(params: {
  userId: number;
  planId: number;
  interval: 'monthly' | 'yearly';
  email: string;
  name?: string;
}): Promise<{ subscriptionId: number; checkoutUrl: string }> {
  // Get plan details
  const [plan] = await db
    .select()
    .from(billing_plans)
    .where(eq(billing_plans.id, params.planId))
    .limit(1);
  
  if (!plan) {
    throw new Error('Plan not found');
  }
  
  // Get or create Stripe customer
  const customerId = await getOrCreateStripeCustomer(params.userId, params.email, params.name);
  
  // Get the appropriate Stripe price ID
  const stripePriceId = params.interval === 'monthly' 
    ? plan.stripePriceIdMonthly 
    : plan.stripePriceIdYearly;
  
  if (!stripePriceId) {
    throw new Error('Plan not configured with Stripe pricing');
  }
  
  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{
      price: stripePriceId,
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.BASE_URL}/settings/billing?canceled=true`,
    metadata: {
      userId: params.userId.toString(),
      planId: params.planId.toString(),
      interval: params.interval
    }
  });
  
  // Create pending subscription in database
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId: params.userId,
      planId: params.planId,
      interval: params.interval,
      stripeCustomerId: customerId,
      status: 'incomplete',
    })
    .returning();
  
  return {
    subscriptionId: subscription.id,
    checkoutUrl: session.url || ''
  };
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Update subscription status
      if (session.subscription && session.customer) {
        const userId = parseInt(session.metadata?.userId || '0');
        const planId = parseInt(session.metadata?.planId || '0');
        const interval = session.metadata?.interval as 'monthly' | 'yearly';
        
        await db
          .update(subscriptions)
          .set({
            stripeSubscriptionId: session.subscription as string,
            stripePriceId: session.metadata?.stripePriceId,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (interval === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000),
            updatedAt: new Date()
          })
          .where(eq(subscriptions.userId, userId));
      }
      break;
    }
    
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      
      if (invoice.customer && invoice.payment_intent) {
        const [subscription] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeCustomerId, invoice.customer as string))
          .limit(1);
        
        if (subscription) {
          // Record payment
          await db.insert(payments).values({
            userId: subscription.userId,
            subscriptionId: subscription.id,
            amount: (invoice.amount_paid / 100).toString(),
            currency: invoice.currency.toUpperCase(),
            description: `Subscription payment - ${invoice.number}`,
            stripePaymentIntentId: invoice.payment_intent as string,
            stripeInvoiceId: invoice.id,
            status: 'succeeded',
            receiptUrl: invoice.hosted_invoice_url,
            receiptEmail: invoice.customer_email
          });
          
          // Update subscription period
          if (invoice.period_start && invoice.period_end) {
            await db
              .update(subscriptions)
              .set({
                currentPeriodStart: new Date(invoice.period_start * 1000),
                currentPeriodEnd: new Date(invoice.period_end * 1000),
                status: 'active',
                updatedAt: new Date()
              })
              .where(eq(subscriptions.id, subscription.id));
          }
        }
      }
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      
      if (invoice.customer) {
        await db
          .update(subscriptions)
          .set({
            status: 'past_due',
            updatedAt: new Date()
          })
          .where(eq(subscriptions.stripeCustomerId, invoice.customer as string));
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      
      await db
        .update(subscriptions)
        .set({
          status: 'canceled',
          canceledAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id));
      break;
    }
    
    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: number): Promise<void> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  
  if (!subscription || !subscription.stripeSubscriptionId) {
    throw new Error('Subscription not found');
  }
  
  // Cancel in Stripe
  await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
  
  // Update in database
  await db
    .update(subscriptions)
    .set({
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(subscriptions.id, subscriptionId));
}

/**
 * Get billing plans
 */
export async function getBillingPlans(): Promise<typeof billing_plans.$inferSelect[]> {
  return db
    .select()
    .from(billing_plans)
    .where(eq(billing_plans.isActive, true))
    .orderBy(billing_plans.displayOrder);
}
