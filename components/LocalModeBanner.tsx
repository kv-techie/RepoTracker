'use client';

import { signIn, useSession } from 'next-auth/react';

/** Shown when browsing local data without GitHub sign-in. */
export default function LocalModeBanner() {
  const { status } = useSession();
  if (status !== 'unauthenticated') return null;

  return (
    <div className="settings-banner local-mode-banner" role="status" aria-label="Local mode">
      <div>
        <strong>Local mode.</strong> Showing repos from this machine only.
        Sign in to add GitHub repos, stars and push history.
      </div>
      <button
        type="button"
        className="btn-secondary local-mode-signin"
        onClick={() => signIn('github', { callbackUrl: window.location.pathname })}
      >
        Sign in with GitHub
      </button>
    </div>
  );
}
