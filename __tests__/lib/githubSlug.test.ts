import { githubSlug } from '@/lib/utils';

describe('githubSlug', () => {
  it('normalises HTTPS and SSH remotes to the same owner/repo', () => {
    expect(githubSlug('https://github.com/kv-techie/RepoTracker.git')).toBe('kv-techie/repotracker');
    expect(githubSlug('git@github.com:kv-techie/RepoTracker.git')).toBe('kv-techie/repotracker');
    expect(githubSlug('https://github.com/kv-techie/RepoTracker')).toBe('kv-techie/repotracker');
  });

  it('does not match two different owners with the same repo name', () => {
    expect(githubSlug('https://github.com/alice/app.git')).not.toBe(githubSlug('https://github.com/bob/app.git'));
  });

  it('returns null for non-GitHub or missing remotes', () => {
    expect(githubSlug('https://gitlab.com/a/b.git')).toBeNull();
    expect(githubSlug(undefined)).toBeNull();
  });
});
