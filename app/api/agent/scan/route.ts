import { NextResponse } from 'next/server';

const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';

export async function POST() {
  try {
    const res = await fetch(`${AGENT_BASE}/scan`, { method: 'POST' });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: 'Agent unreachable' }, { status: 503 });
  }
}
