import { NextRequest, NextResponse } from 'next/server';
import { getUserRepos } from '@/lib/github';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const token = (session as any)?.user?.accessToken as string | undefined;
    const repos = await getUserRepos(token);
    return NextResponse.json(repos);
  } catch (error) {
    console.error('Error in /api/github/repos:', error);
    if ((error as any)?.response?.status === 401) {
      console.warn('GitHub API returned 401 Unauthorized. Returning empty repos list.');
      return NextResponse.json([]);
    }
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
