'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Signed in or not, the dashboard works: without a session it runs in local mode
    if (status !== 'loading') router.push('/dashboard');
  }, [status, router]);

  return (
    <div className="redirect-container">
      <h1>RepoTracker</h1>
      <p>Loading...</p>
    </div>
  );
}
