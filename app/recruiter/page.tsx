'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Repo } from '@/types/repo';
import ProviderBadge from '@/components/ProviderBadge';
import CustomToggle from '@/components/CustomToggle';
import Icon from '@/components/Icon';

interface RecruiterData {
  portfolio_score: number;
  signals: Record<string, string>;
  improvements: string[];
  commentary: string;
  provider: 'ollama' | 'gemini' | 'local';
}

/** Maps a signal word to its tone. Anything unknown stays neutral. */
function signalTone(value: string): string {
  const v = value.toLowerCase();
  if (v.startsWith('strong') || v === 'good' || v === 'high') return 'ok';
  if (v.startsWith('solid') || v === 'moderate') return 'warn';
  if (v.startsWith('early') || v === 'weak' || v === 'low') return 'risk';
  return 'neutral';
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
        if (data.length > 0) setSelectedRepoId(data[0].id);
      })
      .catch(() => setError('Could not reach the local agent. Start it, then reload this page.'));
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;

    setLoading(true);
    setData(null);
    setError('');

    fetch(`/api/agent/repos/${selectedRepoId}/recruiter?skip_ai=${!enableAi}`)
      .then(res => {
        if (!res.ok) throw new Error('The agent could not evaluate this repository.');
        return res.json();
      })
      .then(resData => setData(resData))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedRepoId, enableAi]);

  const selectedName = repos.find(r => r.id === selectedRepoId)?.name;

  return (
    <div className="recruiter-page">
      <header className="page-head">
        <div className="page-head-text">
          <h1 className="page-head-title">Recruiter Lens</h1>
          <p className="page-head-sub">How a hiring manager would read this repository</p>
        </div>

        {repos.length > 0 && (
          <div className="page-head-actions recruiter-controls">
            <CustomToggle id="ai-commentary" checked={enableAi} onChange={setEnableAi} label="AI commentary" />
            <select
              className="settings-input recruiter-select"
              value={selectedRepoId}
              onChange={e => setSelectedRepoId(e.target.value)}
              aria-label="Repository to evaluate"
            >
              {repos.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      {error && (
        <div className="settings-banner settings-banner--error" role="alert">
          <span className="settings-banner-icon"><Icon name="alert" size={16} /></span>
          {error}
        </div>
      )}

      {loading && (
        <div className="recruiter-loading">
          <span className="btn-spinner" />
          Evaluating {selectedName}…
        </div>
      )}

      {data && !loading && (
        <div className="recruiter-grid">
          <section className="panel recruiter-score-panel">
            <span className="panel-eyebrow">Portfolio score</span>
            <p className="recruiter-score">
              {data.portfolio_score}
              <span className="recruiter-score-max">/100</span>
            </p>
            <div className="recruiter-score-bar" role="img" aria-label={`${data.portfolio_score} out of 100`}>
              <span style={{ width: `${data.portfolio_score}%` }} />
            </div>
            {data.signals['Portfolio Readiness'] && (
              <span className={`recruiter-readiness tone-${signalTone(data.signals['Portfolio Readiness'])}`}>
                {data.signals['Portfolio Readiness']}
              </span>
            )}
          </section>

          <section className="panel recruiter-commentary-panel">
            <div className="panel-head">
              <h2 className="panel-title">Commentary</h2>
              {data.commentary && <ProviderBadge provider={data.provider} />}
            </div>

            {data.commentary ? (
              <blockquote className="recruiter-quote">{data.commentary}</blockquote>
            ) : (
              <div className="panel-empty">
                <p>Rule-based scoring only. Turn on AI commentary above for a written assessment.</p>
                <Link href="/settings" className="btn-secondary btn-sm">Configure AI</Link>
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">Hiring signals</h2>
            <dl className="signal-list">
              {Object.entries(data.signals)
                .filter(([key]) => key !== 'Portfolio Readiness')
                .map(([key, value]) => (
                  <div key={key} className="signal-row">
                    <dt className="signal-name">{key}</dt>
                    <dd className={`signal-value tone-${signalTone(value)}`}>{value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section className="panel">
            <h2 className="panel-title">What to improve</h2>
            {data.improvements.length > 0 ? (
              <ol className="improvement-list">
                {data.improvements.map((improvement, idx) => (
                  <li key={idx}>{improvement}</li>
                ))}
              </ol>
            ) : (
              <p className="panel-empty tone-ok">
                <Icon name="check" size={16} /> Nothing outstanding — this repo scores on every criterion.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
