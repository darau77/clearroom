import { engineProxy } from '@/lib/engine-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(request: Request) {
  return (await engineProxy(request, {
    BREV_API_URL: process.env.BREV_API_URL,
    BREV_API_KEY: process.env.BREV_API_KEY,
  })) ?? Response.json({ error: 'Not found' }, { status: 404 });
}
