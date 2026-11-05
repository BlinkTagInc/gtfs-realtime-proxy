import { feedResponse, preflight } from '@/lib/server/http';

export const maxDuration = 5;
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return feedResponse(request, 'alerts');
}

export const HEAD = GET;
export const OPTIONS = preflight;
