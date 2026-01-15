export default {
  async fetch(request) {
    const origin = 'https://velikoyosb.meb.k12.tr';
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

    // Create modified response with CORS headers
    const modifiedResponse = new Response(response.body, response);

    // Set CORS headers
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
    modifiedResponse.headers.set('Access-Control-Expose-Headers', '*');

    return modifiedResponse;
  },
};
