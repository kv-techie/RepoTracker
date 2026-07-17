'use client';

import { useState, useEffect } from 'react';
import { Repo } from '@/types/repo';
import Link from 'next/link';
import ProviderBadge from '@/components/ProviderBadge';
import CustomToggle from '@/components/CustomToggle';

interface RecruiterData {
  portfolio_score: number;
  signals: Record<string, string>;
  improvements: string[];
  commentary: string;
  provider: 'ollama' | 'gemini' | 'local';
}

export default function RecruiterLensPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [data, setData] = useState<RecruiterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enableAi, setEnableAi] = useState(false);

  useEffect(() => {
    fetch('/api/agent/repos')
      .then(res => res.json())
      .then(data => {
        setRepos(data);
        if (data.length > 0) {
          setSelectedRepoId(data[0].id);
        }
      })
      .catch(() => setError('Failed to load repositories'));
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;
    
    setLoading(true);
    setData(null);
    setError('');

    fetch(`/api/agent/repos/${selectedRepoId}/recruiter?skip_ai=${!enableAi}`)
      .then(res => {
        if (!res.ok) throw new Error('Agent failed to evaluate repository');
        return res.json();
      })
      .then(resData => setData(resData))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedRepoId, enableAi]);

  return (
    <div className="main-content" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="dashboard-header" style={{ marginBottom: 32 }}>
        <div>
          <h1 className="dashboard-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Recruiter Lens™
          </h1>
          <p className="dashboard-sub">Simulates how a real hiring manager evaluates your repository.</p>
        </div>
        
        {repos.length > 0 && (
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <CustomToggle 
              checked={enableAi} 
              onChange={setEnableAi} 
              label="Generate AI Commentary" 
            />
            <select 
              className="settings-input" 
              style={{ width: 250 }}
              value={selectedRepoId}
              onChange={e => setSelectedRepoId(e.target.value)}
            >
              {repos.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="settings-banner settings-banner--error" style={{ marginBottom: 24 }}>
          <span className="settings-banner-icon">✕</span>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64, color: 'var(--gray-400)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="btn-spinner" style={{ width: 20, height: 20 }} />
            Analyzing {repos.find(r => r.id === selectedRepoId)?.name}...
          </div>
        </div>
      )}

      {data && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
            {/* Score Card */}
            <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <div style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gray-400)', marginBottom: 8, fontWeight: 600 }}>
                Portfolio Score
              </div>
              <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1, color: data.portfolio_score >= 80 ? 'var(--green-400)' : data.portfolio_score >= 60 ? 'var(--yellow-400)' : 'var(--red-400)' }}>
                {data.portfolio_score}
              </div>
              <div style={{ fontSize: 24, color: 'var(--gray-500)', marginTop: 4 }}>
                / 100
              </div>
            </div>

            {/* Commentary Card */}
            <div className="settings-card" style={{ position: 'relative' }}>
              <h2 className="settings-card-title" style={{ marginBottom: 16 }}>Recruiter Commentary</h2>
              
              {data.commentary ? (
                <>
                  <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--gray-100)', fontStyle: 'italic', paddingLeft: 16, borderLeft: '4px solid var(--gray-700)' }}>
                    "{data.commentary}"
                  </div>
                  <div style={{ position: 'absolute', bottom: 20, right: 24 }}>
                    <ProviderBadge provider={data.provider} />
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', color: 'var(--gray-400)' }}>
                  <p>AI Commentary is disabled. To unlock human-style feedback, please enable Adaptive AI Routing in Settings.</p>
                  <Link href="/settings" className="btn-primary btn-sm">Enable AI in Settings</Link>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Hiring Signals */}
            <div className="settings-card">
              <h2 className="settings-card-title" style={{ marginBottom: 16 }}>Hiring Signals</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(data.signals).map(([key, value]) => {
                  let colorClass = 'var(--gray-400)';
                  if (value === 'Strong' || value === 'High' || value === 'Good') colorClass = 'var(--green-400)';
                  else if (value === 'Moderate') colorClass = 'var(--yellow-400)';
                  else if (value === 'Weak' || value === 'Low') colorClass = 'var(--red-400)';

                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--gray-800)' }}>
                      <span style={{ color: 'var(--gray-300)', fontWeight: 500 }}>{key}</span>
                      <span style={{ color: colorClass, fontWeight: 600, fontSize: 14 }}>{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Improvement Suggestions */}
            <div className="settings-card">
              <h2 className="settings-card-title" style={{ marginBottom: 16 }}>Improvement Suggestions</h2>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 20, margin: 0, color: 'var(--gray-300)' }}>
                {data.improvements.length > 0 ? data.improvements.map((imp, idx) => (
                  <li key={idx} style={{ lineHeight: 1.5 }}>
                    To move to a <strong>{Math.min(100, data.portfolio_score + 9)}</strong>:
                    <br />
                    • {imp}
                  </li>
                )) : (
                  <div style={{ color: 'var(--green-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                    Perfect score! No suggestions.
                  </div>
                )}
              </ul>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}
