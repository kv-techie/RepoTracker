import { NextRequest, NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ repo: string }> }
) {
  try {
    const { repo } = await params;
    const res = await agentFetch(`/repos/${repo}/health`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}
