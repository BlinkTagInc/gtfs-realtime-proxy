import { NextResponse } from 'next/server';
import { buildCacheHeaders, corsHeaders, fetchProtobuf, harden } from '@/lib/server/http';

export const maxDuration = 5;
export const dynamic = 'force-dynamic';

const MAX_AGE_SECONDS = 15 as const;
const SWR_SECONDS = 5 as const;
const STALE_IF_ERROR_SECONDS = 60 as const;

const FETCH_URL = 'https://svc.metrotransit.org/mtgtfs/tripupdates.pb';
const FETCH_HEADERS = {};
const FETCH_TIMEOUT_MS = 2000;

export async function GET() {
  try {
    const upstream = await fetchProtobuf(FETCH_URL, {
      headers: FETCH_HEADERS,
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const res = new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-protobuf',
        ...buildCacheHeaders(MAX_AGE_SECONDS, SWR_SECONDS, STALE_IF_ERROR_SECONDS),
        ...corsHeaders,
      },
    });
    return harden(res);
  } catch (error) {
    console.error(error);
    const res = NextResponse.json(
      { error: true },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          ...corsHeaders,
        },
      },
    );
    return harden(res);
  }
}

export function OPTIONS() {
  const res = new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Max-Age': '600',
      ...corsHeaders,
    },
  });
  return harden(res);
}

export async function HEAD() {
  const res = new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-protobuf',
      ...buildCacheHeaders(MAX_AGE_SECONDS, SWR_SECONDS, STALE_IF_ERROR_SECONDS),
      ...corsHeaders,
    },
  });
  return harden(res);
}