import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb, numeric } from 'drizzle-orm/pg-core';
import { users } from './index';

// API Keys for user-owned API access
export const api_keys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  
  // Key permissions and scope
  permissions: jsonb('permissions').notNull().$type<{
    read: boolean;
    write: boolean;
    admin: boolean;
  }>().default({ read: true, write: false, admin: false }),
  
  // Rate limiting
  rateLimit: integer('rate_limit').notNull().default(100), // requests per minute
  monthlyQuota: integer('monthly_quota').notNull().default(10000), // requests per month
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  keyIdx: index('api_key_key_idx').on(table.key),
  userIdx: index('api_key_user_idx').on(table.userId),
  activeIdx: index('api_key_active_idx').on(table.isActive),
}));

// API Usage tracking
export const api_usage = pgTable('api_usage', {
  id: serial('id').primaryKey(),
  apiKeyId: integer('api_key_id').notNull().references(() => api_keys.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Request details
  endpoint: varchar('endpoint', { length: 500 }).notNull(),
  method: varchar('method', { length: 10 }).notNull(),
  statusCode: integer('status_code').notNull(),
  
  // Performance metrics
  responseTime: integer('response_time').notNull(), // in milliseconds
  requestSize: integer('request_size'), // in bytes
  responseSize: integer('response_size'), // in bytes
  
  // Metadata
  userAgent: varchar('user_agent', { length: 500 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  
  // Timestamp (for aggregation)
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  apiKeyIdx: index('api_usage_key_idx').on(table.apiKeyId),
  userIdx: index('api_usage_user_idx').on(table.userId),
  endpointIdx: index('api_usage_endpoint_idx').on(table.endpoint),
  createdAtIdx: index('api_usage_created_at_idx').on(table.createdAt),
}));

// Aggregated API usage (daily/weekly/monthly)
export const api_usage_aggregates = pgTable('api_usage_aggregates', {
  id: serial('id').primaryKey(),
  apiKeyId: integer('api_key_id').notNull().references(() => api_keys.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Time period
  period: varchar('period', { enum: ['daily', 'weekly', 'monthly'], length: 10 }).notNull(),
  date: timestamp('date').notNull(),
  
  // Aggregated metrics
  totalRequests: integer('total_requests').notNull().default(0),
  successfulRequests: integer('successful_requests').notNull().default(0),
  failedRequests: integer('failed_requests').notNull().default(0),
  avgResponseTime: integer('avg_response_time'), // in milliseconds
  totalDataTransferred: integer('total_data_transferred').default(0), // in bytes
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  apiKeyPeriodIdx: index('api_usage_agg_key_period_idx').on(table.apiKeyId, table.period, table.date),
  userPeriodIdx: index('api_usage_agg_user_period_idx').on(table.userId, table.period, table.date),
}));

// Billing plans
export const billing_plans = pgTable('billing_plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  
  // Pricing
  priceMonthly: numeric('price_monthly', { precision: 10, scale: 2 }).notNull(),
  priceYearly: numeric('price_yearly', { precision: 10, scale: 2 }),
  
  // Stripe integration
  stripeProductId: varchar('stripe_product_id', { length: 255 }),
  stripePriceIdMonthly: varchar('stripe_price_id_monthly', { length: 255 }),
  stripePriceIdYearly: varchar('stripe_price_id_yearly', { length: 255 }),
  
  // Plan limits
  features: jsonb('features').notNull().$type<{
    apiKeys: number;
    monthlyQuota: number;
    rateLimit: number;
    webhooks: number;
    support: 'community' | 'email' | 'priority';
    customDomains: boolean;
    analytics: boolean;
  }>(),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(true),
  displayOrder: integer('display_order').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('billing_plan_slug_idx').on(table.slug),
  activeIdx: index('billing_plan_active_idx').on(table.isActive),
}));

// User subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: integer('plan_id').notNull().references(() => billing_plans.id, { onDelete: 'restrict' }),
  
  // Billing cycle
  interval: varchar('interval', { enum: ['monthly', 'yearly'], length: 10 }).notNull(),
  
  // Stripe integration
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  
  // Status
  status: varchar('status', {
    enum: ['active', 'past_due', 'canceled', 'incomplete', 'trialing', 'unpaid'],
    length: 20
  }).notNull().default('active'),
  
  // Timestamps
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  canceledAt: timestamp('canceled_at'),
  trialEnd: timestamp('trial_end'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('subscription_user_idx').on(table.userId),
  planIdx: index('subscription_plan_idx').on(table.planId),
  statusIdx: index('subscription_status_idx').on(table.status),
  stripeCustomerIdx: index('subscription_stripe_customer_idx').on(table.stripeCustomerId),
  stripeSubscriptionIdx: index('subscription_stripe_subscription_idx').on(table.stripeSubscriptionId),
}));

// Payment history
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: integer('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  
  // Payment details
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  description: text('description'),
  
  // Stripe integration
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
  stripeChargeId: varchar('stripe_charge_id', { length: 255 }),
  
  // Status
  status: varchar('status', {
    enum: ['pending', 'succeeded', 'failed', 'refunded'],
    length: 20
  }).notNull().default('pending'),
  
  // Receipt
  receiptUrl: varchar('receipt_url', { length: 1000 }),
  receiptEmail: varchar('receipt_email', { length: 255 }),
  
  // Refund details
  refundedAt: timestamp('refunded_at'),
  refundReason: text('refund_reason'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('payment_user_idx').on(table.userId),
  subscriptionIdx: index('payment_subscription_idx').on(table.subscriptionId),
  statusIdx: index('payment_status_idx').on(table.status),
  createdAtIdx: index('payment_created_at_idx').on(table.createdAt),
}));

// Webhook endpoints (for marketplace)
export const webhook_endpoints = pgTable('webhook_endpoints', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Endpoint configuration
  url: varchar('url', { length: 500 }).notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  description: text('description'),
  
  // Events to subscribe to
  events: text('events').array().notNull(),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  
  // Stats
  totalDeliveries: integer('total_deliveries').default(0),
  successfulDeliveries: integer('successful_deliveries').default(0),
  failedDeliveries: integer('failed_deliveries').default(0),
  lastDeliveryAt: timestamp('last_delivery_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('webhook_endpoint_user_idx').on(table.userId),
  activeIdx: index('webhook_endpoint_active_idx').on(table.isActive),
}));

// Webhook deliveries (for user-owned endpoints)
export const webhook_endpoint_deliveries = pgTable('webhook_endpoint_deliveries', {
  id: serial('id').primaryKey(),
  endpointId: integer('endpoint_id').notNull().references(() => webhook_endpoints.id, { onDelete: 'cascade' }),
  
  // Delivery details
  event: varchar('event', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  
  // Response details
  status: varchar('status', {
    enum: ['pending', 'success', 'failed', 'retrying'],
    length: 20
  }).notNull().default('pending'),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  
  // Retry logic
  attemptNumber: integer('attempt_number').default(1),
  maxAttempts: integer('max_attempts').default(3),
  nextRetryAt: timestamp('next_retry_at'),
  
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  endpointIdx: index('webhook_ep_delivery_endpoint_idx').on(table.endpointId),
  statusIdx: index('webhook_ep_delivery_status_idx').on(table.status),
  createdAtIdx: index('webhook_ep_delivery_created_at_idx').on(table.createdAt),
}));
