/**
 * Cloudflare Pages Worker for SPA routing
 * Handles client-side routing by serving index.html for all non-file requests
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Don't rewrite requests for actual files (has extension)
    if (pathname.includes('.')) {
      return fetch(request);
    }

    // Don't rewrite API requests or other special paths
    if (pathname.startsWith('/api/') || pathname.startsWith('/.well-known/')) {
      return fetch(request);
    }

    // Rewrite all other requests to index.html for SPA routing
    const indexRequest = new Request(new URL('/index.html', url), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return fetch(indexRequest);
  },
};
