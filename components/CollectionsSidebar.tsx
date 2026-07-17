'use client';

import { useState } from 'react';
import type { Collection } from '@/lib/collections';
import { createCollection, deleteCollection } from '@/lib/collections';

interface Props {
  collections: Collection[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: () => void;
}

const PRESET_COLORS = [
  'var(--color-ink)',
  'var(--color-graphite)',
  'var(--color-slate)',
  'var(--color-stone)',
  'var(--color-action-blue)',
  'var(--color-silver)'
];

export default function CollectionsSidebar({ collections, activeId, onSelect, onUpdate }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    createCollection(newName.trim(), newColor);
    setNewName('');
    setIsAdding(false);
    onUpdate();
  };

  const handleDelete = (id: string) => {
    deleteCollection(id);
    if (activeId === id) onSelect(null);
    onUpdate();
  };

  return (
    <aside className="collections-sidebar">
      <div className="sidebar-header">
        <h3 className="sidebar-title">Collections</h3>
        <button
          className="sidebar-add-btn"
          onClick={() => setIsAdding(v => !v)}
          aria-label="Add collection"
          id="add-collection-btn"
        >
          +
        </button>
      </div>

      {isAdding && (
        <div className="collection-form">
          <input
            id="new-collection-name"
            className="collection-input"
            placeholder="Collection name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <div className="color-swatches">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`color-swatch ${newColor === c ? 'swatch-active' : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <button className="btn-primary btn-sm" onClick={handleAdd}>Create</button>
        </div>
      )}

      <ul className="collection-list">
        <li>
          <button
            className={`collection-item ${activeId === null ? 'collection-item--active' : ''}`}
            onClick={() => onSelect(null)}
            id="collection-all"
          >
            <span className="col-dot" style={{ background: 'var(--color-silver)' }} />
            All repos
          </button>
        </li>
        {collections.map(col => (
          <li key={col.id}>
            <button
              className={`collection-item ${activeId === col.id ? 'collection-item--active' : ''}`}
              onClick={() => onSelect(col.id)}
              id={`collection-${col.id}`}
            >
              <span className="col-dot" style={{ background: col.color }} />
              {col.name}
              <button
                className="col-delete-btn"
                onClick={e => { e.stopPropagation(); handleDelete(col.id); }}
                aria-label={`Delete ${col.name}`}
              >
                ×
              </button>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
