const feeds = {
  vehiclepositions: 'VEHICLEPOSITIONS',
  tripupdates: 'TRIPUPDATES',
  alerts: 'ALERTS',
} as const;

const commonHeaders = {
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Accept-Encoding',
};

const protobufTypes = new Set([
  'application/x-protobuf',
  'application/protobuf',
  'application/vnd.google.protobuf',
  'application/octet-stream',
]);
const maxBytes = 5 * 1024 * 1024;

function headerConfig(raw?: string): Record<string, string> {
  const values = JSON.parse(raw ?? '{}');
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.values(values).some((value) => typeof value !== 'string')
  ) {
    throw new Error('Invalid header configuration');
  }
  return Object.fromEntries(new Headers(values));
}

function seconds(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error('Invalid cache duration');
  }
  return Number(raw);
}

async function readFeed(response: Response) {
  const type = response.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase();
  if (
    response.status !== 200 ||
    !protobufTypes.has(type) ||
    !response.body ||
    Number(response.headers.get('content-length')) > maxBytes
  ) {
    await response.body?.cancel();
    throw new Error('Unexpected upstream response');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Feed exceeds size limit');
    }
    chunks.push(value as Uint8Array<ArrayBuffer>);
  }
  if (size === 0) {
    throw new Error('Empty feed');
  }
  return new Blob(chunks, { type: 'application/x-protobuf' });
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: { ...commonHeaders, 'Access-Control-Max-Age': '600' },
  });
}

export async function feedResponse(request: Request, feed: keyof typeof feeds) {
  function failure(status: number) {
    return new Response(request.method === 'HEAD' ? null : '{"error":true}', {
      status,
      headers: {
        ...commonHeaders,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    });
  }
  if (new URL(request.url).search) {
    return failure(400);
  }
  const prefix = 'GTFS_' + feeds[feed];
  const url = process.env[prefix + '_URL'];
  if (!url) {
    return failure(404);
  }
  let headers: Headers;
  let cacheHeaders: Record<string, string>;
  try {
    headers = new Headers({
      ...headerConfig(process.env.GTFS_HEADERS),
      ...headerConfig(process.env[prefix + '_HEADERS']),
    });
    const protocol = new URL(url).protocol;
    if (
      protocol !== 'https:' &&
      (protocol !== 'http:' || [...headers].length > 0)
    ) {
      throw new Error('Invalid upstream protocol');
    }
    const isAlerts = feed === 'alerts';
    const ttl = seconds(prefix + '_CACHE_SECONDS', isAlerts ? 60 : 5);
    const browser = Math.min(ttl, seconds('GTFS_BROWSER_CACHE_SECONDS', ttl));
    const swr = seconds('GTFS_SWR_SECONDS', isAlerts ? 5 : 0);
    const stale = seconds('GTFS_STALE_IF_ERROR_SECONDS', isAlerts ? 120 : 30);
    cacheHeaders = {
      'Cache-Control': `public, max-age=${browser}, must-revalidate`,
      'CDN-Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${swr}, stale-if-error=${stale}`,
    };
  } catch {
    console.error(feed, 'invalid configuration');
    return failure(500);
  }
  const signal = AbortSignal.timeout(4000);
  try {
    const response = await fetch(url, {
      headers,
      signal,
      cache: 'no-store',
      redirect: [...headers].length ? 'error' : 'follow',
    });
    if (response.status !== 200) {
      console.warn(feed, 'upstream HTTP', response.status);
    }
    const blob = await readFeed(response);
    return new Response(request.method === 'HEAD' ? null : blob, {
      headers: {
        ...commonHeaders,
        ...cacheHeaders,
        'Content-Type': 'application/x-protobuf',
      },
    });
  } catch {
    console.warn(
      feed,
      signal.aborted ? 'upstream timeout' : 'upstream fetch failed',
    );
    return failure(signal.aborted ? 504 : 502);
  }
}
