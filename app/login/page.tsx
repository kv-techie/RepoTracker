'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  // If already authenticated, go straight to the dashboard
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  const handleGitHubLogin = () => {
    // For OAuth providers the redirect MUST happen — pass callbackUrl so
    // GitHub returns the user directly to the dashboard after auth.
    signIn('github', { callbackUrl: '/dashboard' });
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="loading-spinner" />
          <p>Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>RepoTracker</h1>
        <p>Track real coding activity—even when you forget to commit.</p>

        <button
          onClick={handleGitHubLogin}
          className="btn-github-login"
          id="github-login-btn"
        >
          Sign in with GitHub
        </button>
        <a href="/dashboard" className="login-local-link" id="continue-local-link">
          Continue with local repos only
        </a>
      </div>
    </div>
  );
}
