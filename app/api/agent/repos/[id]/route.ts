import { NextRequest, NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const res = await agentFetch(`/repos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 404) return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}
