/**
 * Titan AI - GitHub API Client
 * Server-side Octokit wrapper using the authenticated user's GitHub token.
 */

import { Octokit } from '@octokit/rest';
import { getGithubToken } from '@/lib/auth';

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  updatedAt: string;
  owner: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  sha: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  profileUrl: string;
  publicRepos: number;
  privateRepos: number;
}

/**
 * Create an authenticated Octokit client using the current session token.
 * Throws if not authenticated.
 */
export async function createGitHubClient(): Promise<Octokit> {
  const token = await getGithubToken();
  if (!token) {
    throw new Error('Not authenticated. Please sign in with GitHub.');
  }
  return new Octokit({ auth: token });
}

/**
 * Create a GitHub client with a specific token (for use in API routes where
 * you already have the token from the session).
 */
export function createGitHubClientWithToken(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Get the authenticated user's profile.
 */
export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  const octokit = createGitHubClientWithToken(token);
  const { data } = await octokit.users.getAuthenticated();
  return {
    id: data.id,
    login: data.login,
    name: data.name ?? null,
    email: data.email ?? null,
    avatarUrl: data.avatar_url,
    profileUrl: data.html_url,
    publicRepos: data.public_repos,
    privateRepos: data.total_private_repos ?? 0,
  };
}

/**
 * List repositories for the authenticated user.
 */
export async function listUserRepos(token: string, options?: {
  type?: 'all' | 'owner' | 'member';
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
  per_page?: number;
  page?: number;
}): Promise<GitHubRepo[]> {
  const octokit = createGitHubClientWithToken(token);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    type: options?.type ?? 'all',
    sort: options?.sort ?? 'updated',
    per_page: options?.per_page ?? 100,
    page: options?.page ?? 1,
  });

  return data.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    private: repo.private,
    fork: repo.fork,
    cloneUrl: repo.clone_url ?? '',
    sshUrl: repo.ssh_url ?? '',
    defaultBranch: repo.default_branch,
    language: repo.language ?? null,
    stars: repo.stargazers_count ?? 0,
    updatedAt: repo.updated_at ?? '',
    owner: repo.owner?.login ?? '',
  }));
}

/**
 * Get a single repository's details.
 */
export async function getRepo(token: string, owner: string, repo: string): Promise<GitHubRepo> {
  const octokit = createGitHubClientWithToken(token);
  const { data } = await octokit.repos.get({ owner, repo });
  return {
    id: data.id,
    name: data.name,
    fullName: data.full_name,
    description: data.description ?? null,
    private: data.private,
    fork: data.fork,
    cloneUrl: data.clone_url,
    sshUrl: data.ssh_url,
    defaultBranch: data.default_branch,
    language: data.language ?? null,
    stars: data.stargazers_count,
    updatedAt: data.updated_at ?? '',
    owner: data.owner.login,
  };
}

/**
 * List branches for a repository.
 */
export async function listBranches(token: string, owner: string, repo: string): Promise<GitHubBranch[]> {
  const octokit = createGitHubClientWithToken(token);
  const { data } = await octokit.repos.listBranches({ owner, repo, per_page: 100 });
  return data.map(b => ({
    name: b.name,
    protected: b.protected,
    sha: b.commit.sha,
  }));
}

/**
 * Build authenticated clone URL.
 * Embeds token in the HTTPS URL so git push works without prompting.
 */
export function buildAuthenticatedCloneUrl(cloneUrl: string, token: string): string {
  try {
    const url = new URL(cloneUrl);
    url.username = 'oauth2';
    url.password = token;
    return url.toString();
  } catch {
    return cloneUrl;
  }
}
