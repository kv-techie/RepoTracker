import { NextRequest, NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET() {
  try {
    const res = await agentFetch(`/config`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await agentFetch(`/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Pass validation errors (e.g. a folder that does not exist) back to the caller
    if (res.status === 422) return NextResponse.json(await res.json(), { status: 422 });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}
