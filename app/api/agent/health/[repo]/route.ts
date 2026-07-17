import { NextRequest, NextResponse } from 'next/server';

const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ repo: string }> }
) {
  try {
    const { repo } = await params;
    const res = await fetch(`${AGENT_BASE}/repos/${repo}/health`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}
