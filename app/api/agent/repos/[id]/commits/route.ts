import { NextRequest, NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await agentFetch(`/repos/${id}/commits`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error(`Failed to fetch commits for ${await params.then(p => p.id)}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
