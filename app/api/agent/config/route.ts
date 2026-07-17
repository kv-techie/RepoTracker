import { NextRequest, NextResponse } from 'next/server';

const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';

export async function GET() {
  try {
    const res = await fetch(`${AGENT_BASE}/config`);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${AGENT_BASE}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}
