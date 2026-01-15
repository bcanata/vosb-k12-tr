export default {
  async fetch(request) {
    const origin = 'https://velikoyosb.meb.k12.tr';
    const proxyHost = 'vosb.k12.tr';
    const url = new URL(request.url);
    const targetUrl = new URL(origin + url.pathname + url.search);

    // Copy headers from the incoming request
    const incomingHeaders = new Headers(request.headers);
    const headers = new Headers();

    // Copy all headers except those we need to modify
    incomingHeaders.forEach((value, key) => {
      if (!['host', 'origin', 'referer'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Set Referer to match the origin site
    headers.set('Referer', origin);

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Fetch the resource
    let response;
    try {
      response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
      });
    } catch (error) {
      return new Response('Failed to fetch from origin: ' + error.message, {
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Clone the response to read the body
    const contentType = response.headers.get('Content-Type') || '';

    // Check if we need to rewrite the content (only for text-based content)
    const shouldRewrite = contentType.includes('text/html') ||
                          contentType.includes('text/javascript') ||
                          contentType.includes('application/javascript') ||
                          contentType.includes('text/css') ||
                          contentType.includes('application/json') ||
                          contentType.includes('text/xml') ||
                          contentType.includes('application/xml');

    // Only rewrite successful responses
    if (shouldRewrite && response.status === 200) {
      try {
        // Read and rewrite the content with a timeout
        const text = await Promise.race([
          response.text(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Rewrite timeout')), 25000)
          ),
        ]);

        // Replace all occurrences of the origin domain with the proxy domain
        const rewritten = text.replace(new RegExp(origin.replace(/\./g, '\\.'), 'g'), `https://${proxyHost}`);

        // Create new response with rewritten content
        const modifiedResponse = new Response(rewritten, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });

        // Set CORS headers
        modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
        modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
        modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
        modifiedResponse.headers.set('Access-Control-Expose-Headers', '*');

        return modifiedResponse;
      } catch (rewriteError) {
        // If rewriting fails, fall through to regular proxy
      }
    }

    // For non-text responses or errors, just proxy with CORS headers
    const modifiedResponse = new Response(response.body, response);

    // Set CORS headers
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
    modifiedResponse.headers.set('Access-Control-Expose-Headers', '*');

    return modifiedResponse;
  },
};
