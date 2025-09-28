import { NextResponse } from 'next/server';

export const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Origin': '*',
} as const;

export function buildCacheHeaders(maxAge: number, swr: number, staleIfError: number) {
  const value = `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${swr}, stale-if-error=${staleIfError}, must-revalidate`;
  return {
    'Cache-Control': value,
    'CDN-Cache-Control': value,
  };
}

export function harden(res: NextResponse) {
  // Remove cookies and pin a safe Vary for maximal CDN cacheability.
  res.headers.set('Vary', 'Accept-Encoding');
  res.headers.delete('Set-Cookie');
  return res;
}

export async function withRetry<T>(fn: () => Promise<T>, delays: number[] = [150, 300]) {
  let lastError: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
    }
    if (i < delays.length) {
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw lastError;
}

export async function fetchProtobuf(
  url: string,
  opts?: { headers?: HeadersInit; timeoutMs?: number },
): Promise<Response> {
  // Fetch upstream protobuf with no-store, timeout, and retries; returns the upstream Response to allow streaming.
  const headers = opts?.headers ?? {};
  const timeoutMs = opts?.timeoutMs ?? 2000;

  return withRetry(async () => {
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Upstream fetch failed: ${res.status}`);
    return res;
  });
}