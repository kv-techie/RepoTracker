import type { Metadata } from 'next';
import { Poppins, Inter } from 'next/font/google';
import Navbar from '@/components/Navbar';
import { Providers } from './providers';
import AgentationWrapper from '@/components/AgentationWrapper';
import '@/styles/globals.css';

const poppins = Poppins({ 
  weight: ['600'], 
  subsets: ['latin'],
  variable: '--font-cal-sans'
});

const inter = Inter({ 
  weight: ['300', '400', '500', '600'], 
  subsets: ['latin'],
  variable: '--font-inter'
});

export const metadata: Metadata = {
  title: 'RepoTracker — Your Personal Coding Activity Cockpit',
  description: 'Track your real coding activity — even when you forget to commit. Hybrid local + GitHub repository observability platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${inter.variable}`}>
      <body>
        <Providers>
          <Navbar />
          <main className="main-container">
            {children}
          </main>
          {process.env.NODE_ENV === 'development' && <AgentationWrapper />}
        </Providers>
      </body>
    </html>
  );
}
