import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  // Local owner only: DNS rebinding and cross-origin writes must not reach Actions.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return new Response('Otherlore is local-only.', { status: 403 });
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin) return new Response('Same-origin requests only.', { status: 403 });
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  // Preserve Origin on same-origin browser form POSTs; no-referrer can produce Origin: null.
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Cache-Control', 'no-store');
  return response;
});