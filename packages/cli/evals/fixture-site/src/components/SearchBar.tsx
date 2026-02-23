import React, { useEffect, useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // PERF ISSUE: Adds keydown listener on every render without cleanup
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onChange('');
      }
    };
    document.addEventListener('keydown', handler);
    // Missing cleanup: no removeEventListener
  });

  // PERF ISSUE: Regex compiled on every call instead of module-level constant
  const sanitize = (input: string): string => {
    const pattern = new RegExp('[<>"\'/\\\\]', 'g');
    return input.replace(pattern, '');
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search items..."
        value={value}
        onChange={(e) => onChange(sanitize(e.target.value))}
        style={{
          padding: '8px 12px',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          fontSize: '14px',
          width: '240px',
        }}
      />
      {value && (
        <button className="btn" onClick={() => onChange('')}>
          Clear
        </button>
      )}
    </div>
  );
}
