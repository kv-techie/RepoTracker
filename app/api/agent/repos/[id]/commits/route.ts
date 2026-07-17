import { NextRequest, NextResponse } from 'next/server';

const AGENT_BASE = process.env.AGENT_BASE_URL ?? 'http://127.0.0.1:8001';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await fetch(`${AGENT_BASE}/repos/${id}/commits`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error(`Failed to fetch commits for ${await params.then(p => p.id)}:`, err);
    return NextResponse.json([], { status: 500 });
  }
}
