import { defineMiddleware, sequence } from 'astro/middleware';
import { getSession } from 'auth-astro/server';

// Routes that require authentication
const protectedPaths = [
  '/dashboard',
  '/articles/new',
  '/articles/edit',
  '/api/articles',
  '/api/revisions',
];

// Routes that are always public
const publicPaths = [
  '/',
  '/login',
  '/signup',
  '/logout',
  '/auth',
  '/api/auth',
  '/about',
  '/articles',
  '/categories',
  '/reputation',
  '/profiles',
  '/badges',
  '/notifications',
  '/sitemap.xml',
];

function isProtectedPath(pathname: string): boolean {
  // Check for exact protected paths
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    // Check if it's a public read operation (GET to /articles/[slug])
    if (pathname.match(/^\/articles\/[^/]+$/) && !pathname.includes('/edit')) {
      return false;
    }
    // Check if it's a revision view (public)
    if (pathname.match(/^\/articles\/[^/]+\/revisions/)) {
      return false;
    }
    return true;
  }
  return false;
}

const authMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Get session for all requests
  const session = await getSession(context.request);
  
  // Skip auth for public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // But still attach session to locals for use in pages
    if (session) {
      context.locals.user = session.user;
      context.locals.session = session;
    }
    return next();
  }
  
  // Check if path is protected
  if (isProtectedPath(pathname)) {    
    if (!session) {
      // For API routes, return 401
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // For page routes, redirect to login
      return context.redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
    
    // Attach user to locals
    context.locals.user = session.user;
    context.locals.session = session;
  }
  
  return next();
});

export const onRequest = sequence(authMiddleware);
