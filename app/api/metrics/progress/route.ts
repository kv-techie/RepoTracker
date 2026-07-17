import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const commitCount = parseInt(searchParams.get('commits') || '0');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 }
      );
    }

    // TODO: Implement actual progress calculation
    const progress = {
      repoName: `${owner}/${repo}`,
      totalLines: 0,
      commitCount,
      activityScore: 0,
      healthScore: 0,
      lastUpdateDate: new Date().toISOString(),
      estimatedCompletion: null,
    };

    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error in /api/metrics/progress:', error);
    return NextResponse.json(
      { error: 'Failed to calculate progress' },
      { status: 500 }
    );
  }
}
