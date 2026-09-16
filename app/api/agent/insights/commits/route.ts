import { NextResponse } from 'next/server';
import { agentFetch } from '@/lib/agentProxy';

export async function GET() {
  try {
    const res = await agentFetch('/insights/commits');
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}
