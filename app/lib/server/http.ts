import { NextResponse } from 'next/server';

export const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Origin': '*',
} as const;

const DEFAULT_DEADLINE_MS = 4500;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 2000;
const DEFAULT_RETRY_DELAYS_MS = [150, 300] as const;

type FetchUpstreamOptions = {
  headers?: HeadersInit;
  deadlineMs?: number;
  attemptTimeoutMs?: number;
  retryDelaysMs?: readonly number[];
  allowedContentTypes: readonly string[];
  maxBytes: number;
};

export function buildCacheHeaders(
  maxAge: number,
  swr: number,
  staleIfError: number,
) {
  const value = `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${swr}, stale-if-error=${staleIfError}, must-revalidate`;
  return {
    'Cache-Control': value,
    'CDN-Cache-Control': value,
  };
}

export function harden(res: NextResponse) {
  // Remove cookies and pin a safe Vary for maximal CDN cacheability.
  res.headers.set('Vary', 'Accept-Encoding');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.delete('Set-Cookie');
  return res;
}

export function rejectQueryParameters(request: Request) {
  if (!new URL(request.url).search) return null;

  return harden(
    NextResponse.json(
      { error: true },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
          ...corsHeaders,
        },
      },
    ),
  );
}

export async function withRetry<T>(
  fn: (remainingMs: number) => Promise<T>,
  delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  deadlineMs: number = DEFAULT_DEADLINE_MS,
) {
  const deadline = performance.now() + deadlineMs;
  let lastError: unknown;

  for (let i = 0; i <= delays.length; i++) {
    const remainingMs = Math.floor(deadline - performance.now());
    if (remainingMs <= 0) break;

    try {
      return await fn(remainingMs);
    } catch (e) {
      lastError = e;
    }

    if (i < delays.length) {
      const remainingAfterAttemptMs = Math.floor(deadline - performance.now());
      const delayMs = delays[i];
      if (remainingAfterAttemptMs <= delayMs) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}

function validateAndLimitResponse(
  response: Response,
  allowedContentTypes: readonly string[],
  maxBytes: number,
) {
  const contentType = response.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();

  if (!contentType || !allowedContentTypes.includes(contentType)) {
    void response.body?.cancel();
    throw new Error(
      `Unexpected upstream Content-Type: ${contentType ?? 'none'}`,
    );
  }

  const contentLengthHeader = response.headers.get('Content-Length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      void response.body?.cancel();
      throw new Error('Invalid upstream Content-Length');
    }
    if (contentLength > maxBytes) {
      void response.body?.cancel();
      throw new Error('Upstream response exceeds the size limit');
    }
  }

  if (!response.body) return response;

  let bytesRead = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (bytesRead > maxBytes) {
        throw new Error('Upstream response exceeds the size limit');
      }
      controller.enqueue(chunk);
    },
  });

  return new Response(response.body.pipeThrough(limiter), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function fetchUpstream(
  url: string,
  opts: FetchUpstreamOptions,
): Promise<Response> {
  const headers = opts.headers ?? {};
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  const response = await withRetry(
    async (remainingMs) => {
      const res = await fetch(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(attemptTimeoutMs, remainingMs)),
        ),
      });
      if (!res.ok) {
        void res.body?.cancel();
        throw new Error(`Upstream fetch failed: ${res.status}`);
      }
      return res;
    },
    retryDelaysMs,
    deadlineMs,
  );

  return validateAndLimitResponse(
    response,
    opts.allowedContentTypes,
    opts.maxBytes,
  );
}

export async function fetchProtobuf(
  url: string,
  opts?: {
    headers?: HeadersInit;
    deadlineMs?: number;
    attemptTimeoutMs?: number;
    maxBytes?: number;
  },
): Promise<Response> {
  return fetchUpstream(url, {
    headers: opts?.headers,
    deadlineMs: opts?.deadlineMs,
    attemptTimeoutMs: opts?.attemptTimeoutMs,
    allowedContentTypes: [
      'application/x-protobuf',
      'application/protobuf',
      'application/vnd.google.protobuf',
      'application/octet-stream',
    ],
    maxBytes: opts?.maxBytes ?? 5 * 1024 * 1024,
  });
}
