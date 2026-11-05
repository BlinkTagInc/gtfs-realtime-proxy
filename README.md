# GTFS-Realtime Proxy

An API to retrieve GTFS-Realtime data, add CORS headers and cache responses. This makes GTFS-Realtime available directly to client-side code within a web browser.

Built with next.js.

The public routes are `/vehiclepositions`, `/tripupdates` and `/alerts`. GET returns protobuf bytes with public CORS headers. HEAD checks the same feed and omits the body. OPTIONS handles preflight. Requests with query parameters return 400.

## Local setup

Copy `.env.example` to `.env.local` for a working Metro Transit configuration. Install dependencies with `pnpm install` and run `pnpm dev`. For a production build, use `pnpm build` followed by `pnpm start`.

Open the following URLs to see the result:

- [http://localhost:3000/vehiclepositions](http://localhost:3000/vehiclepositions)
- [http://localhost:3000/tripupdates](http://localhost:3000/tripupdates)
- [http://localhost:3000/alerts](http://localhost:3000/alerts)

## Agency configuration

Set environment variables for each GTFS-realtime feed URL. An omitted feed URL disables that endpoint (404).

| Public path         | Upstream URL                | Default cache lifetime |
| ------------------- | --------------------------- | ---------------------- |
| `/vehiclepositions` | `GTFS_VEHICLEPOSITIONS_URL` | 5 seconds              |
| `/tripupdates`      | `GTFS_TRIPUPDATES_URL`      | 5 seconds              |
| `/alerts`           | `GTFS_ALERTS_URL`           | 15 seconds             |

For authenticated feeds, set `GTFS_HEADERS` to a JSON object such as `{"X-API-Key":"your-key"}`. It goes to **every configured feed**. For credentials specific to one provider, use `GTFS_ALERTS_HEADERS`, `GTFS_TRIPUPDATES_HEADERS` or `GTFS_VEHICLEPOSITIONS_HEADERS`. Per-feed values override shared headers by name. Enter raw JSON in Vercel. Use the final HTTPS URL for feeds with configured headers. The proxy rejects redirects on those requests to protect credentials.

## Caching and cost

The Vercel CDN shares successful responses across visitors. Browsers can reuse them for the same lifetime. Override the defaults with `GTFS_VEHICLEPOSITIONS_CACHE_SECONDS`, `GTFS_TRIPUPDATES_CACHE_SECONDS`, and `GTFS_ALERTS_CACHE_SECONDS`. Set `GTFS_BROWSER_CACHE_SECONDS` to cap browser caching independently. All durations are nonnegative whole seconds.

Refreshes happen on demand. For positions and trips, the first request after expiry waits for fresh data. For alerts, the CDN can serve the previous response for another 5 seconds while fetching the update in the background. If an upstream fetch fails, a cached success may be reused for up to 30 seconds past expiry for positions and trips, or 120 seconds for alerts. These windows measure time since caching, and the provider’s data may already be older.

Leave `GTFS_SWR_SECONDS` and `GTFS_STALE_IF_ERROR_SECONDS` unset for these feed-specific defaults. Setting either overrides its window for all feeds in the project. Use zero to disable that window.

An upstream fetch has one four-second budget including reading the body. The proxy checks HTTP status, content type, and body size before returning a cacheable response. Upstream failures return 502 and timeouts return 504, with caching disabled.
