import { NextResponse } from 'next/server';

const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const skipAi = searchParams.get('skip_ai');
    const url = new URL(`${AGENT_BASE}/repos/${id}/recruiter`);
    if (skipAi) url.searchParams.set('skip_ai', skipAi);
    
    const res = await fetch(url.toString(), { 
      // Do not cache this, we want fresh AI output or fresh rule-based evaluation
      cache: 'no-store' 
    });
    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
      throw new Error(`Agent returned ${res.status}`);
    }
    return NextResponse.json(await res.json());
  } catch (error: any) {
    return NextResponse.json({ error: 'Agent unreachable', details: error.message }, { status: 503 });
  }
}
