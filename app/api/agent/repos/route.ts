import { NextRequest, NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag');
  const collection = searchParams.get('collection');

  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  if (collection) params.set('collection', collection);

  try {
    const res = await agentFetch(`/repos?${params}`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
