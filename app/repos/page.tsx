import { redirect } from 'next/navigation';

/** The dashboard replaced this page; keep the path working for old links and bookmarks. */
export default function ReposPage() {
  redirect('/dashboard');
}
