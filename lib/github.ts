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

export async function getUserRepos(tokenOverride?: string): Promise<Repo[]> {
  try {
    const response = await githubClient.get('/user/repos', {
      headers: authHeaders(tokenOverride),
      params: {
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching user repos:', error);
    throw error;
  }
}

export async function getRepoCommits(
  owner: string,
  repo: string,
  branch: string = 'main',
  tokenOverride?: string
): Promise<Commit[]> {
  try {
    const response = await githubClient.get(
      `/repos/${owner}/${repo}/commits`,
      {
        headers: authHeaders(tokenOverride),
        params: {
          sha: branch,
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

export async function getRepoReadme(owner: string, repo: string, tokenOverride?: string): Promise<string> {
  try {
    const response = await githubClient.get(`/repos/${owner}/${repo}/readme`, {
      headers: { ...authHeaders(tokenOverride), Accept: 'application/vnd.github.v3.raw' },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching README for ${owner}/${repo}:`, error);
    return '';
  }
}

export async function getRepoLanguages(owner: string, repo: string, tokenOverride?: string): Promise<Record<string, number>> {
  try {
    const response = await githubClient.get(`/repos/${owner}/${repo}/languages`, {
      headers: authHeaders(tokenOverride),
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching languages for ${owner}/${repo}:`, error);
    return {};
  }
}

export async function getRepoStats(owner: string, repo: string, tokenOverride?: string) {
  try {
    const response = await githubClient.get(`/repos/${owner}/${repo}`, {
      headers: authHeaders(tokenOverride),
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching repo stats for ${owner}/${repo}:`, error);
    throw error;
  }
}
