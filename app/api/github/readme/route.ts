import { NextRequest, NextResponse } from 'next/server';
import { getRepoReadme } from '@/lib/github';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 }
      );
    }

    const readme = await getRepoReadme(owner, repo);
    return NextResponse.json({ content: readme });
  } catch (error) {
    console.error('Error in /api/github/readme:', error);
    return NextResponse.json(
      { error: 'Failed to fetch README' },
      { status: 500 }
    );
  }
}
