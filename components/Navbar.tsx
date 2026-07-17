'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/insights', label: 'Insights' },
  { href: '/recruiter', label: 'Recruiter Lens™' },
  { href: '/settings', label: 'Settings' },
];

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const lastLogin = session ? new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-inner">
        <Link href="/dashboard" className="navbar-brand" aria-label="RepoTracker home">
          <span className="brand-icon">◈</span>
          <span className="brand-name">RepoTracker</span>
        </Link>

        <ul className="navbar-links" role="list">
          {NAV_LINKS.map(link => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`nav-link ${pathname === link.href ? 'nav-link--active' : ''}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="navbar-user">
          {session ? (
            <div className="nav-profile" ref={dropdownRef}>
              <button
                className="nav-profile-btn"
                onClick={() => setDropdownOpen(v => !v)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                id="user-menu-btn"
              >
                {session.user?.name?.split(' ')[0]}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4 }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="nav-dropdown" role="menu">
                  <div className="nav-dropdown-header">
                    {session.user?.image && (
                      <img src={session.user.image} alt="avatar" className="nav-avatar" />
                    )}
                    <div>
                      <p className="nav-dropdown-name">{session.user?.name}</p>
                      <p className="nav-dropdown-meta">
                        @{(session.user as any)?.login ?? session.user?.name?.toLowerCase().replace(/\s/g, '')}
                      </p>
                    </div>
                  </div>
                  <div className="nav-dropdown-divider" />
                  <div className="nav-dropdown-row">
                    <span className="nav-dropdown-label">Email</span>
                    <span className="nav-dropdown-value">{session.user?.email ?? '—'}</span>
                  </div>
                  <div className="nav-dropdown-row">
                    <span className="nav-dropdown-label">Last login</span>
                    <span className="nav-dropdown-value">{lastLogin}</span>
                  </div>
                  <div className="nav-dropdown-divider" />
                  <button
                    className="nav-dropdown-signout"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    id="signout-btn"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="btn-primary btn-sm">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
