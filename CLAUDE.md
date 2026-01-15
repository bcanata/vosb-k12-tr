# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker that mirrors the Turkish Ministry of Education school website `https://velikoyosb.meb.k12.tr` to the domain `vosb.k12.tr`. The project is extremely minimal, consisting of a single `index.js` file with no build process or dependencies.

## Architecture

The worker exports a default object with a `fetch` method that handles all HTTP requests. The core functionality is:

1. **Request Proxying**: Forwards incoming requests to the origin K12 school website
2. **CORS Handling**: Adds appropriate CORS headers to enable cross-origin requests from any domain
3. **Header Management**: Strips `host`, `origin`, and `referer` from incoming requests and replaces them with the origin site's values
4. **Preflight Support**: Handles OPTIONS requests for CORS preflight

## Key Implementation Details

- **Origin URL**: `https://velikoyosb.meb.k12.tr` (defined in `index.js:3`)
- **Header filtering**: The proxy copies all headers except `host`, `origin`, and `referer` from the incoming request
- **Forced headers**: Always sets `Referer` and `Origin` to the target origin, and adds `X-Requested-With: XMLHttpRequest`
- **CORS policy**: Allows all origins (`*`), methods (`GET, POST, OPTIONS, HEAD`), and headers

## Development

There are no build scripts, tests, or linting configured. To work with this codebase:

1. Edit `index.js` directly
2. Deploy to Cloudflare Workers using `wrangler publish` (requires Wrangler CLI)
3. Test by making requests to the deployed worker URL

The code uses standard Web APIs (fetch, Headers, URL) available in the Cloudflare Workers runtime.