'use client';

import React from 'react';

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export default function CustomToggle({ checked, onChange, label }: CustomToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 90,
          height: 42,
          borderRadius: 42,
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
          backgroundColor: checked ? '#e8541e' : '#b0b0b0',
          boxShadow: checked
            ? '0 4px 14px rgba(232, 84, 30, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 4px 14px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10)',
          transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {/* ON label - visible when ON */}
        <span
          style={{
            position: 'absolute',
            left: 12,
            color: 'white',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: 0.5,
            fontFamily: 'var(--font-sans, Inter, sans-serif)',
            userSelect: 'none',
            opacity: checked ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        >
          ON
        </span>

        {/* OFF label - visible when OFF */}
        <span
          style={{
            position: 'absolute',
            right: 11,
            color: 'white',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: 0.5,
            fontFamily: 'var(--font-sans, Inter, sans-serif)',
            userSelect: 'none',
            opacity: checked ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          OFF
        </span>

        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            left: checked ? 52 : 4,
            width: 34,
            height: 34,
            borderRadius: '50%',
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.30)',
            transition: 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        />
      </button>

      {label && (
        <span
          style={{
            fontSize: 14,
            color: 'var(--gray-300)',
            fontWeight: 500,
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
