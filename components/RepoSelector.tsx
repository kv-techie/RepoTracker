'use client';

import { useState } from 'react';
import { Repo } from '@/types/repo';

interface RepoSelectorProps {
  repos: Repo[];
  onSelect: (repo: Repo) => void;
  selectedRepo?: Repo;
}

export default function RepoSelector({
  repos,
  onSelect,
  selectedRepo,
}: RepoSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="repo-selector">
      <input
        type="text"
        placeholder="Search repositories..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />

      <div className="repo-list">
        {filtered.map((repo) => (
          <button
            key={repo.id}
            onClick={() => onSelect(repo)}
            className={`repo-item ${
              selectedRepo?.id === repo.id ? 'active' : ''
            }`}
          >
            <div className="repo-name">{repo.name}</div>
            <div className="repo-meta">
              <span className="stars">⭐ {repo.github_stars}</span>
              <span className="forks">🍴 {repo.github_forks}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
