import { NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET() {
  try {
    // Local models can be slow; the agent falls back to an empty summary rather than hanging
    const res = await agentFetch('/ai/summary', {}, 90_000);
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ summary: '', ai_enabled: false }, { status: 503 });
  }
}
