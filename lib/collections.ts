/**
 * Custom Collections — stored in localStorage (offline-first, no backend needed).
 * Collections are named groups of repos, e.g. "freelance", "college", "experiments".
 */

export interface Collection {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

const STORAGE_KEY = 'rt_collections';

function load(): Collection[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(collections: Collection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
}

export function getCollections(): Collection[] {
  return load();
}

export function createCollection(name: string, color = '#6366f1'): Collection {
  const collections = load();
  const col: Collection = {
    id: `col_${Date.now()}`,
    name: name.trim(),
    color,
    createdAt: new Date().toISOString(),
  };
  save([...collections, col]);
  return col;
}

export function deleteCollection(id: string): void {
  save(load().filter(c => c.id !== id));
}

export function renameCollection(id: string, name: string): void {
  save(load().map(c => (c.id === id ? { ...c, name } : c)));
}

// Repo→Collection mapping stored separately
const REPO_COL_KEY = 'rt_repo_collections';

function loadRepoMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(REPO_COL_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function assignRepoToCollection(repoId: string, collectionId: string | null): void {
  const map = loadRepoMap();
  if (collectionId === null) {
    delete map[repoId];
  } else {
    map[repoId] = collectionId;
  }
  localStorage.setItem(REPO_COL_KEY, JSON.stringify(map));
}

export function getRepoCollection(repoId: string): string | null {
  return loadRepoMap()[repoId] ?? null;
}

export function getCollectionForRepo(repoId: string): Collection | null {
  const colId = getRepoCollection(repoId);
  if (!colId) return null;
  return load().find(c => c.id === colId) ?? null;
}
