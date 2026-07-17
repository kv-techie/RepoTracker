'use client';

import dynamic from 'next/dynamic';

// Lazy load Agentation to avoid SSR issues and improve initial load time (per Performance Rules)
const Agentation = dynamic(() => import('agentation').then((mod) => mod.Agentation), {
  ssr: false,
});

export default function AgentationWrapper() {
  return <Agentation />;
}
