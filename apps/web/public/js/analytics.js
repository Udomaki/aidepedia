/**
 * Privacy-focused analytics tracking script for AIdepedia
 * No cookies • No PII • GDPR compliant
 */

(function() {
  'use strict';

  const TRACKING_ENDPOINT = '/api/v1/analytics/track';
  const SCROLL_THRESHOLD = 10; // Track scroll depth at 10% intervals

  let path = window.location.pathname;
  let articleId = null;
  let startTime = Date.now();
  let maxScrollDepth = 0;
  let trackedScrollDepths = new Set<number>();
  let hasTrackedPageView = false;

  // Extract article ID from page if available
  function extractArticleId() {
    const articleElement = document.querySelector('[data-article-id]');
    if (articleElement) {
      articleId = parseInt(articleElement.getAttribute('data-article-id') || '', 10);
    }
  }

  // Track page view
  async function trackPageView() {
    if (hasTrackedPageView) return;
    hasTrackedPageView = true;

    const payload = {
      path: path,
      articleId: articleId,
      referrer: document.referrer || undefined,
    };

    try {
      // Use sendBeacon for reliability, fallback to fetch
      if (navigator.sendBeacon) {
        navigator.sendBeacon(TRACKING_ENDPOINT, JSON.stringify(payload));
      } else {
        await fetch(TRACKING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      }
    } catch (error) {
      console.error('Analytics tracking error:', error);
    }
  }

  // Track engagement metrics
  async function trackEngagement() {
    const readTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    const payload = {
      path: path,
      articleId: articleId,
      readTimeSeconds: readTimeSeconds,
      scrollDepth: maxScrollDepth,
    };

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(TRACKING_ENDPOINT, JSON.stringify(payload));
      } else {
        await fetch(TRACKING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      }
    } catch (error) {
      console.error('Analytics engagement tracking error:', error);
    }
  }

  // Track scroll depth
  function trackScrollDepth() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrollPercent = Math.round((scrollTop / scrollHeight) * 100);

    if (scrollPercent > maxScrollDepth) {
      maxScrollDepth = scrollPercent;
    }

    // Track at threshold intervals (10%, 20%, 30%, etc.)
    const threshold = Math.floor(scrollPercent / SCROLL_THRESHOLD) * SCROLL_THRESHOLD;
    if (!trackedScrollDepths.has(threshold) && threshold > 0) {
      trackedScrollDepths.add(threshold);
      // Could send milestone events here if needed
    }
  }

  // Initialize tracking
  function init() {
    extractArticleId();

    // Track page view after page loads
    if (document.readyState === 'complete') {
      trackPageView();
    } else {
      window.addEventListener('load', trackPageView);
    }

    // Track scroll depth
    window.addEventListener('scroll', trackScrollDepth, { passive: true });

    // Track engagement when leaving page
    window.addEventListener('beforeunload', trackEngagement);

    // Also track on page hide (more reliable on mobile)
    window.addEventListener('pagehide', trackEngagement);
  }

  // Start tracking
  init();
})();
