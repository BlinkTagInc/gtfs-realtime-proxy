import { NextResponse } from 'next/server';

export const maxDuration = 5;
export const revalidate = 15;

const FETCH_URL = 'https://svc.metrotransit.org/mtgtfs/tripupdates.pb';
const FETCH_HEADERS = {};
const FETCH_TIMEOUT_MS = 2000;

async function fetchData() {
  const response = await fetch(FETCH_URL, {
    headers: FETCH_HEADERS,
    next: { revalidate },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch data from the target URL');
  }

  return response.arrayBuffer();
}

export async function GET() {
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await fetchData();

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': `max-age=0, s-maxage=${revalidate}`,
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
          'Cache-Control': 'no-store',
          ...corsHeaders,
        },
      },
    );
  }
}
