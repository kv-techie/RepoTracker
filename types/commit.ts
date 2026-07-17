export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
}

export interface CommitStats {
  totalCommits: number;
  commitsThisMonth: number;
  commitsThisWeek: number;
  topCommitter: string;
  averageCommitsPerDay: number;
}
