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

    // Check if we need to rewrite the content
    const shouldRewrite = contentType.includes('text/html') ||
                          contentType.includes('text/javascript') ||
                          contentType.includes('application/javascript') ||
                          contentType.includes('text/css') ||
                          contentType.includes('application/json') ||
                          contentType.includes('text/xml') ||
                          contentType.includes('application/xml');

    if (shouldRewrite && response.status === 200) {
      // Read and rewrite the content
      const text = await response.text();

      // Replace all occurrences of the origin domain with the proxy domain
      // Handle both http and https, with and without trailing slashes
      let rewritten = text
        .replace(new RegExp(origin.replace(/\./g, '\\.'), 'g'), `https://${proxyHost}`)
        .replace(/https?:\/\/vosb\.k12\.tr/g, `https://${proxyHost}`)
        .replace(/http:\/\/vosb\.k12\.tr/g, `https://${proxyHost}`);

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
