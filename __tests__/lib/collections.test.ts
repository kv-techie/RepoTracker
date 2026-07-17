/**
 * Tests for lib/collections.ts — localStorage collections.
 */

import {
  getCollections, createCollection, deleteCollection, renameCollection,
  assignRepoToCollection, getRepoCollection, getCollectionForRepo,
} from '@/lib/collections';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; },
    removeItem: (key: string) => { delete store[key]; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

beforeEach(() => localStorageMock.clear());

describe('getCollections', () => {
  it('returns empty array initially', () => {
    expect(getCollections()).toEqual([]);
  });
});

describe('createCollection', () => {
  it('creates and persists a collection', () => {
    const col = createCollection('freelance', '#6366f1');
    expect(col.name).toBe('freelance');
    expect(col.color).toBe('#6366f1');
    expect(col.id).toMatch(/^col_/);
    expect(getCollections()).toHaveLength(1);
  });

  it('creates multiple collections', () => {
    createCollection('one');
    createCollection('two');
    expect(getCollections()).toHaveLength(2);
  });

  it('trims whitespace from name', () => {
    const col = createCollection('  college  ');
    expect(col.name).toBe('college');
  });
});

describe('deleteCollection', () => {
  it('removes the collection', () => {
    const col = createCollection('to-delete');
    deleteCollection(col.id);
    expect(getCollections()).toHaveLength(0);
  });

  it('does not throw for unknown id', () => {
    expect(() => deleteCollection('unknown_id')).not.toThrow();
  });
});

describe('renameCollection', () => {
  it('renames correctly', () => {
    const col = createCollection('old');
    renameCollection(col.id, 'new');
    expect(getCollections()[0].name).toBe('new');
  });
});

describe('assignRepoToCollection', () => {
  it('assigns a repo to a collection', () => {
    assignRepoToCollection('repo1', 'col1');
    expect(getRepoCollection('repo1')).toBe('col1');
  });

  it('removes assignment when null is passed', () => {
    assignRepoToCollection('repo1', 'col1');
    assignRepoToCollection('repo1', null);
    expect(getRepoCollection('repo1')).toBeNull();
  });
});

describe('getCollectionForRepo', () => {
  it('returns correct collection object', () => {
    const col = createCollection('experiment');
    assignRepoToCollection('repo2', col.id);
    const result = getCollectionForRepo('repo2');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('experiment');
  });

  it('returns null when no assignment', () => {
    expect(getCollectionForRepo('no-repo')).toBeNull();
  });
});
