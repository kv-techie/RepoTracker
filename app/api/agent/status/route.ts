import { NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET() {
  try {
    const res = await agentFetch(`/status`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ online: false, error: 'Agent unreachable' }, { status: 503 });
  }
}
