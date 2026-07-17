export function calculateProgressPercentage(
  current: number,
  total: number
): number {
  if (total === 0) return 0;
  return Math.min(Math.round((current / total) * 100), 100);
}

export function estimateCompletionDate(
  commitsPerDay: number,
  remainingCommits: number
): Date {
  if (commitsPerDay === 0) return new Date();
  const daysRemaining = Math.ceil(remainingCommits / commitsPerDay);
  const completionDate = new Date();
  completionDate.setDate(completionDate.getDate() + daysRemaining);
  return completionDate;
}

export function calculateHealthScore(
  commitFrequency: number,
  lastCommitDaysSince: number,
  issuesCount: number
): number {
  let score = 100;

  // Deduct based on commit frequency
  if (commitFrequency < 1) score -= 30;
  else if (commitFrequency < 3) score -= 15;
  else if (commitFrequency > 20) score -= 5;

  // Deduct based on last commit age
  if (lastCommitDaysSince > 180) score -= 30;
  else if (lastCommitDaysSince > 90) score -= 15;
  else if (lastCommitDaysSince > 30) score -= 5;

  // Deduct based on issues
  if (issuesCount > 50) score -= 20;
  else if (issuesCount > 20) score -= 10;

  return Math.max(score, 0);
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getTimeSinceLastCommit(lastCommitDate: string): number {
  const lastCommit = new Date(lastCommitDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastCommit.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
}
