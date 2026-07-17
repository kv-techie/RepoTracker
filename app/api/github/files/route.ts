import { NextRequest, NextResponse } from 'next/server';
import { getRepoLanguages } from '@/lib/github';

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

    const languages = await getRepoLanguages(owner, repo);
    return NextResponse.json(languages);
  } catch (error) {
    console.error('Error in /api/github/files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch file information' },
      { status: 500 }
    );
  }
}
