import { NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const skipAi = searchParams.get('skip_ai');
    const query = skipAi ? `?skip_ai=${encodeURIComponent(skipAi)}` : '';
    // agentFetch never caches: we want fresh AI output or fresh rule-based evaluation
    // AI commentary on a local model can take up to a minute
    const res = await agentFetch(`/repos/${id}/recruiter${query}`, {}, 90_000);
    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
      throw new Error(`Agent returned ${res.status}`);
    }
    return NextResponse.json(await res.json());
  } catch (error: any) {
    return NextResponse.json({ error: 'Agent unreachable', details: error.message }, { status: 503 });
  }
}
