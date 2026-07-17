import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepoCommits } from '@/lib/github';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const branch = searchParams.get('branch') || 'main';

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const token = (session as any)?.user?.accessToken as string | undefined;

    const commits = await getRepoCommits(owner, repo, branch, token);
    return NextResponse.json(commits);
  } catch (error) {
    console.error('Error in /api/github/commits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch commits' },
      { status: 500 }
    );
  }
}
