import { NextResponse } from 'next/server';

export const maxDuration = 5;

const CACHE_TIME_S = 60 * 60; // 1 hour
const FETCH_URL = 'https://mtma.tripshot.com/v1/stop';
const FETCH_HEADERS = {};
const FETCH_TIMEOUT_MS = 2000;

export async function GET() {
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const response = await fetch(FETCH_URL, {
      headers: FETCH_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch data from the target URL');
    }

    const data = await response.json();

    // Release the lock by simply letting it expire
    // Return the fetched raw binary data as a response
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': `max-age=0, s-maxage=${CACHE_TIME_S}`,
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: true },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store', // Prevent caching of error responses
          ...corsHeaders,
        },
      },
    );
  }
}
