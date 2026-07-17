/**
 * Client-side export utilities.
 * CSV: pure JS string manipulation.
 * PDF: uses jsPDF (client-side, no server needed).
 */

import type { TrackedRepo } from '@/types/repo';

// ── CSV ─────────────────────────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportReposAsCsv(repos: TrackedRepo[], filename = 'repos.csv'): void {
  const headers = [
    'Name', 'Source Type', 'Latest Source', 'Branch',
    'Health Score', 'Momentum', 'Staleness Risk',
    'Uncommitted Changes', 'Local Ahead', 'Remote Ahead',
    'Last Activity', 'Tags', 'Collection',
  ];

  const rows = repos.map(r => [
    r.name,
    r.source_type,
    r.latest_source,
    r.current_branch,
    r.health?.score ?? '',
    r.momentum?.level ?? '',
    r.staleness?.risk ?? '',
    r.sync.uncommitted_changes,
    r.sync.local_ahead_by,
    r.sync.remote_ahead_by,
    r.latest_activity_at ?? '',
    r.tags.join(';'),
    r.collection ?? '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
  _downloadText(csv, filename, 'text/csv');
}

// ── PDF ─────────────────────────────────────────────────────────────────────

export async function exportReposAsPdf(repos: TrackedRepo[], filename = 'repos.pdf'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 60);
  doc.text('RepoTracker — Repository Summary', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 120);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageW / 2, y, { align: 'center' });
  y += 12;

  for (const repo of repos) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 30, 60);
    doc.text(repo.name, 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 100);
    const lines = [
      `Source: ${repo.latest_source} · Branch: ${repo.current_branch} · Type: ${repo.source_type}`,
      `Health: ${repo.health?.score ?? '—'}/100 (${repo.health?.level ?? '—'}) · Momentum: ${repo.momentum?.level ?? '—'}`,
      `Staleness: ${repo.staleness?.risk ?? '—'} · Uncommitted: ${repo.sync.uncommitted_changes} · Ahead: ${repo.sync.local_ahead_by}`,
      `Tags: ${repo.tags.join(', ') || 'none'} · Last activity: ${repo.latest_activity_at ? new Date(repo.latest_activity_at).toLocaleDateString() : '—'}`,
    ];
    lines.forEach(line => {
      doc.text(line, 14, y);
      y += 5;
    });

    // Separator
    doc.setDrawColor(220, 220, 230);
    doc.line(14, y, pageW - 14, y);
    y += 5;
  }

  doc.save(filename);
}

// ── Internal ─────────────────────────────────────────────────────────────────

function _downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
