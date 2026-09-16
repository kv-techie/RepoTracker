import { NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function POST() {
  try {
    const res = await agentFetch(`/scan`, { method: 'POST' });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}
