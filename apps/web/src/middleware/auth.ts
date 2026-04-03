import { defineMiddleware, sequence } from 'astro/middleware';
import { getSession } from 'auth-astro/server';
import { rateLimitMiddleware } from './rate-limit';
import { apiVersionMiddleware } from './api-version';
import { performanceMiddleware } from './performance';
import { cacheMiddleware } from './cache';
import { getMaintenanceModeSettings } from '@aidepedia/db/queries';

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
  '/maintenance',
];

// Admin-only routes
const adminPaths = [
  '/admin',
];

// Paths that should bypass maintenance mode
const maintenanceBypassPaths = [
  '/api/v1/admin/maintenance',
  '/api/auth',
  '/auth',
  '/login',
  '/logout',
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

function isAdminPath(pathname: string): boolean {
  return adminPaths.some(path => pathname.startsWith(path));
}

function shouldBypassMaintenance(pathname: string): boolean {
  return maintenanceBypassPaths.some(path => pathname.startsWith(path));
}

// Maintenance mode middleware
const maintenanceMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Skip maintenance check for bypass paths
  if (shouldBypassMaintenance(pathname)) {
    return next();
  }
  
  // Check if maintenance mode is enabled
  try {
    const maintenanceSettings = await getMaintenanceModeSettings();
    
    if (maintenanceSettings.enabled) {
      // Check if user is admin
      const session = await getSession(context.request);
      const isAdmin = session && (
        (session.user as any)?.role === 'admin' || 
        (session.user as any)?.tier === 'admin'
      );
      
      // Allow admin users to bypass maintenance mode
      if (isAdmin) {
        return next();
      }
      
      // Redirect all other users to maintenance page
      // For API routes, return 503 Service Unavailable
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({
          error: 'Service Unavailable',
          message: maintenanceSettings.message,
          retryAfter: maintenanceSettings.estimatedTime || '30 minutes',
        }), {
          status: 503,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': '300', // 5 minutes
          },
        });
      }
      
      // For page routes, redirect to maintenance page
      // Don't redirect if already on maintenance page
      if (pathname !== '/maintenance') {
        return context.redirect('/maintenance');
      }
    }
  } catch (error) {
    // If we can't check maintenance mode (e.g., DB error), continue normally
    console.error('Error checking maintenance mode:', error);
  }
  
  return next();
});

const authMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Get session for all requests
  const session = await getSession(context.request);
  
  // Check SSO enforcement for login/signup routes
  if ((pathname === '/login' || pathname === '/signup') && session?.user?.email) {
    const { checkSSORequired } = await import('./saml');
    const ssoCheck = await checkSSORequired(session.user.email as string);
    
    if (ssoCheck.required && ssoCheck.idp) {
      // Redirect to SSO login
      const callbackUrl = context.url.searchParams.get('callbackUrl') || '/dashboard';
      
      if (ssoCheck.idp.type === 'saml') {
        const { getSAMLLoginUrl } = await import('./saml');
        const result = await getSAMLLoginUrl(ssoCheck.organization!.id, callbackUrl);
        
        if (result.url) {
          return context.redirect(result.url);
        }
      } else if (ssoCheck.idp.type === 'oidc') {
        const { getOIDCAuthorizationUrl, generatePKCE } = await import('./oidc');
        const { verifier, challenge } = generatePKCE();
        const state = Buffer.from(JSON.stringify({
          organizationId: ssoCheck.organization!.id,
          callbackUrl,
          codeVerifier: verifier,
          timestamp: Date.now(),
        })).toString('base64');
        
        const result = await getOIDCAuthorizationUrl(ssoCheck.organization!.id, state, challenge);
        
        if (result.url) {
          return context.redirect(result.url);
        }
      }
    }
  }
  
  // Skip auth for public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // But still attach session to locals for use in pages
    if (session) {
      context.locals.user = session.user;
      context.locals.session = session;
    }
    return next();
  }
  
  // Check if user needs onboarding
  if (session?.user?.id && !pathname.startsWith('/onboarding') && !pathname.startsWith('/api/onboarding')) {
    const { db, users, eq } = await import('@aidepedia/db');
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(session.user.id)))
      .limit(1);
    
    // Redirect to onboarding if not completed
    if (user && !user.onboardingCompletedAt) {
      // For API routes, return a special response
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ 
          error: 'Onboarding required',
          redirect: '/onboarding' 
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // For page routes, redirect to onboarding
      return context.redirect('/onboarding');
    }
  }
  
  // Check admin routes first
  if (isAdminPath(pathname)) {
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
    
    // Check if user has admin role
    // Note: In production, you'd fetch the user's editor record and check tier
    // For now, we'll use a simple email check or session role
    const isAdmin = (session.user as any)?.role === 'admin' || 
                    (session.user as any)?.tier === 'admin';
    
    if (!isAdmin) {
      // For API routes, return 403
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Forbidden - Admin access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // For page routes, redirect to home with error
      return context.redirect('/?error=admin_required');
    }
    
    // Attach user to locals
    context.locals.user = session.user;
    context.locals.session = session;
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

export const onRequest = sequence(
  rateLimitMiddleware,
  apiVersionMiddleware,
  maintenanceMiddleware,
  authMiddleware,
  cacheMiddleware,
  performanceMiddleware
);
