import { NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET() {
  try {
    const res = await agentFetch(`/ai/stats`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (error: any) {
    return NextResponse.json({ error: 'Agent unreachable', details: error.message }, { status: 503 });
  }
}
