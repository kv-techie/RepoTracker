import { NextResponse } from 'next/server';

const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';

export async function GET() {
  try {
    const res = await fetch(`${AGENT_BASE}/status`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ online: false, error: 'Agent unreachable' }, { status: 503 });
  }
}
