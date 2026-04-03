/**
 * Seed default billing plans
 * OC-124: API Monetization - Default billing plans
 */

import { db } from './index';
import { billing_plans } from './schema/monetization';

async function seedBillingPlans() {
  console.log('Seeding billing plans...');
  
  const plans = [
    {
      name: 'Free',
      slug: 'free',
      description: 'Perfect for getting started with API access',
      priceMonthly: '0',
      priceYearly: '0',
      features: {
        apiKeys: 1,
        monthlyQuota: 1000,
        rateLimit: 60,
        webhooks: 2,
        support: 'community' as const,
        customDomains: false,
        analytics: false
      },
      isActive: true,
      isPublic: true,
      displayOrder: 0
    },
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Great for small projects and side hustles',
      priceMonthly: '29',
      priceYearly: '290',
      features: {
        apiKeys: 5,
        monthlyQuota: 10000,
        rateLimit: 100,
        webhooks: 10,
        support: 'email' as const,
        customDomains: false,
        analytics: true
      },
      isActive: true,
      isPublic: true,
      displayOrder: 1
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'For professional developers and growing businesses',
      priceMonthly: '99',
      priceYearly: '990',
      features: {
        apiKeys: 20,
        monthlyQuota: 100000,
        rateLimit: 300,
        webhooks: 50,
        support: 'priority' as const,
        customDomains: true,
        analytics: true
      },
      isActive: true,
      isPublic: true,
      displayOrder: 2
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'For large-scale applications with custom needs',
      priceMonthly: '299',
      priceYearly: '2990',
      features: {
        apiKeys: -1, // Unlimited
        monthlyQuota: -1, // Unlimited
        rateLimit: 1000,
        webhooks: -1, // Unlimited
        support: 'priority' as const,
        customDomains: true,
        analytics: true
      },
      isActive: true,
      isPublic: true,
      displayOrder: 3
    }
  ];
  
  for (const plan of plans) {
    await db.insert(billing_plans).values(plan).onConflictDoUpdate({
      target: billing_plans.slug,
      set: plan
    });
    console.log(`✓ Seeded plan: ${plan.name}`);
  }
  
  console.log('✓ Billing plans seeded successfully');
}

// Run seed
seedBillingPlans()
  .then(() => {
    console.log('Seeding complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
