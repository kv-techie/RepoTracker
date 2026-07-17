'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import RepoCard from '@/components/RepoCard';
import { getUserRepos } from '@/lib/github';
import { Repo } from '@/types/repo';

export default function ReposPage() {
  const { status } = useSession();
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchRepos();
    }
  }, [status, router]);

  const fetchRepos = async () => {
    try {
      const data = await getUserRepos();
      setRepos(data);
    } catch (error) {
      console.error('Error fetching repos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <div>Loading repositories...</div>;

  return (
    <div className="repos-container">
      <div className="repos-header">
        <h1>Repositories</h1>
        <p>{repos.length} repositories found</p>
      </div>

      <div className="repos-search">
        <input
          type="text"
          placeholder="Search repositories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="repos-grid">
        {filteredRepos.length > 0 ? (
          filteredRepos.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))
        ) : (
          <p className="no-results">No repositories found</p>
        )}
      </div>
    </div>
  );
}
