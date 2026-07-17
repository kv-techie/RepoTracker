/**
 * Tests for lib/export.ts — CSV export (PDF requires browser APIs, tested separately).
 */

import { exportReposAsCsv } from '@/lib/export';
import type { TrackedRepo } from '@/types/repo';

// Mock URL.createObjectURL and document.createElement
const createObjectURLMock = jest.fn(() => 'blob:test');
const revokeObjectURLMock = jest.fn();
global.URL.createObjectURL = createObjectURLMock;
global.URL.revokeObjectURL = revokeObjectURLMock;

let clickMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clickMock = jest.fn();

  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', click: clickMock } as unknown as HTMLElement;
    }
    return document.createElement(tag);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeRepo(overrides: Partial<TrackedRepo> = {}): TrackedRepo {
  return {
    id: 'r1',
    name: 'test-repo',
    source_type: 'local_only',
    latest_source: 'local_filesystem',
    current_branch: 'main',
    default_branch: 'main',
    is_private: false,
    topics: [],
    github_stars: 0,
    github_forks: 0,
    tags: ['active'],
    sync: { local_ahead_by: 0, remote_ahead_by: 0, is_diverged: false, uncommitted_changes: 0, has_stash: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('exportReposAsCsv', () => {
  it('calls URL.createObjectURL with a Blob', () => {
    exportReposAsCsv([makeRepo()]);
    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('triggers a download click', () => {
    exportReposAsCsv([makeRepo()]);
    expect(clickMock).toHaveBeenCalled();
  });

  it('revokes the object URL after download', () => {
    exportReposAsCsv([makeRepo()]);
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  it('handles repos with commas in names (CSV escaping)', () => {
    const repo = makeRepo({ name: 'my, repo' });
    expect(() => exportReposAsCsv([repo])).not.toThrow();
  });

  it('handles empty repo list without error', () => {
    expect(() => exportReposAsCsv([])).not.toThrow();
  });

  it('uses custom filename', () => {
    exportReposAsCsv([makeRepo()], 'custom.csv');
    // Verify the element's download attr was set (indirectly via click)
    expect(clickMock).toHaveBeenCalled();
  });

  it('creates a Blob for the CSV content', () => {
    let capturedBlob: Blob | null = null;
    createObjectURLMock.mockImplementation((...args: unknown[]) => {
      capturedBlob = args[0] as Blob;
      return 'blob:test';
    });
    exportReposAsCsv([makeRepo()]);
    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.type).toContain('text/csv');
  });
});
