import { NextRequest, NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await agentFetch('/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 90_000);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ answer: 'The agent is offline.' }, { status: 503 });
  }
}
