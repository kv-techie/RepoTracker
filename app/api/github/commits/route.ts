import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRepoCommits } from '@/lib/github';

// Reads the request (search params / session), so it can never be prerendered
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    // Empty branch lets GitHub use the repo's default branch (main, master, ...)
    const branch = searchParams.get('branch') || undefined;

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
    // 404 (gone or renamed) and 409 (empty repo) are normal for a repo list that drifts:
    // report no commits rather than failing the page
    const status = (error as any)?.response?.status;
    if (status === 404 || status === 409) return NextResponse.json([]);
    console.error('Error in /api/github/commits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch commits' },
      { status: 500 }
    );
  }
}
