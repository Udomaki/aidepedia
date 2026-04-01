import { defineMiddleware } from 'astro/middleware';
import { logApiPerformance } from '../lib/performance';

export const performanceMiddleware = defineMiddleware(async (context, next) => {
  const startTime = Date.now();
  const { pathname } = context.url;
  const method = context.request.method;
  
  // Only track API routes
  if (!pathname.startsWith('/api/')) {
    return next();
  }
  
  // Continue with the request
  const response = await next();
  
  // Calculate response time
  const responseTime = Date.now() - startTime;
  
  // Add X-Response-Time header
  response.headers.set('X-Response-Time', `${responseTime}ms`);
  
  // Log performance asynchronously (don't block the response)
  const userId = context.locals.user?.id ? parseInt(context.locals.user.id) : undefined;
  const userAgent = context.request.headers.get('user-agent') || undefined;
  const ipAddress = context.clientAddress;
  
  // Fire and forget - don't await
  logApiPerformance(
    pathname,
    method,
    responseTime,
    response.status,
    userId,
    userAgent,
    ipAddress
  ).catch(error => {
    console.error('Failed to log API performance:', error);
  });
  
  return response;
});
