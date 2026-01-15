# Velikoyosb MEB Proxy

A Cloudflare Worker that mirrors the Turkish Ministry of Education school website `https://velikoyosb.meb.k12.tr` to `vosb.k12.tr` with CORS support.

## Features

- **CORS Proxy**: Enables cross-origin requests to the school website
- **Header Management**: Properly forwards requests with appropriate headers
- **Preflight Support**: Handles OPTIONS requests for CORS preflight
- **Error Handling**: Returns 502 errors with proper CORS headers on fetch failures

## Deployment

The worker is deployed at: https://velikoyosb-proxy.bugra.workers.dev

Custom domain: https://vosb.k12.tr

## Development

This is a single-file Cloudflare Worker with no build process. To make changes:

1. Edit `index.js`
2. Deploy with `wrangler deploy`

## Origin

This proxy forwards all requests to: `https://velikoyosb.meb.k12.tr`

## License

MIT
