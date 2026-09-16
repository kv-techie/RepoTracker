import axios from 'axios';
import { Repo, Commit } from '@/types/repo';

const GITHUB_API_BASE = 'https://api.github.com';

const githubClient = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    Accept: 'application/vnd.github.v3+json',
  },
});

// Build per-request auth headers. Prefers the caller-supplied token (OAuth)
// over the env PAT. If neither is set, omit the header so GitHub returns a
// 401 (with a clear message) rather than sending `token undefined`.
function authHeaders(tokenOverride?: string): Record<string, string> {
  const token = tokenOverride || process.env.GITHUB_PAT;
  if (!token || token === 'your_github_personal_access_token') return {};
  return { Authorization: `token ${token}` };
}

/** GitHub caps a page at 100; follow the Link header so large accounts are not silently cut off. */
function nextPageUrl(linkHeader?: string): string | null {
  const match = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/** Turns a rate-limit rejection into a message that says when it lifts. */
export function describeGitHubError(error: any): string {
  const status = error?.response?.status;
  const remaining = error?.response?.headers?.['x-ratelimit-remaining'];
  const reset = error?.response?.headers?.['x-ratelimit-reset'];
  if ((status === 403 || status === 429) && remaining === '0' && reset) {
    const at = new Date(Number(reset) * 1000);
    return `GitHub rate limit reached. It resets at ${at.toLocaleTimeString()}.`;
  }
  if (status === 401) return 'GitHub rejected the credentials. Sign in again.';
  return 'GitHub request failed.';
}

export async function getUserRepos(tokenOverride?: string, maxPages = 5): Promise<Repo[]> {
  try {
    const repos: Repo[] = [];
    let url: string | null = '/user/repos';
    let params: Record<string, unknown> | undefined = { per_page: 100, sort: 'updated', direction: 'desc' };

    for (let page = 0; url && page < maxPages; page++) {
      const response: any = await githubClient.get(url, { headers: authHeaders(tokenOverride), params });
      repos.push(...response.data);
      url = nextPageUrl(response.headers?.link);
      params = undefined;  // the next URL already carries the query
    }
    return repos;
  } catch (error) {
    console.error('Error fetching user repos:', describeGitHubError(error));
    throw error;
  }
}

export async function getRepoCommits(
  owner: string,
  repo: string,
  branch?: string,
  tokenOverride?: string
): Promise<Commit[]> {
  try {
    const response = await githubClient.get(
      `/repos/${owner}/${repo}/commits`,
      {
        headers: authHeaders(tokenOverride),
        params: {
          ...(branch ? { sha: branch } : {}),
          per_page: 100,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching commits for ${owner}/${repo}:`, error);
    throw error;
  }
}
