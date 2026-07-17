/**
 * Deployed repo registry — persisted in localStorage.
 * A repo marked as deployed is excluded from stale classification.
 */

const KEY = 'repotracker:deployed';

export function getDeployedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function setDeployed(id: string, deployed: boolean): void {
  const ids = getDeployedIds();
  if (deployed) ids.add(id);
  else ids.delete(id);
  localStorage.setItem(KEY, JSON.stringify([...ids]));
}

export function isDeployed(id: string): boolean {
  return getDeployedIds().has(id);
}
