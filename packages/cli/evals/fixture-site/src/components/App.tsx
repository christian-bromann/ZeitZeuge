import React, { useEffect, useState, useCallback } from 'react';
import { Dashboard } from './Dashboard';
import { ItemList } from './ItemList';
import { SearchBar } from './SearchBar';
import { heavyInitialization } from '../utils/heavy-init';

export function App() {
  const [items, setItems] = useState<Array<{ id: number; name: string; tags: string[] }>>([]);
  const [filter, setFilter] = useState('');

  // PERF ISSUE: Heavy synchronous work during mount blocks the main thread
  useEffect(() => {
    const data = heavyInitialization();
    setItems(data);
  }, []);

  // PERF ISSUE: Non-passive scroll listener added on every render
  useEffect(() => {
    const handler = () => {
      // PERF ISSUE: Layout thrashing — reading and writing DOM in rapid succession
      const header = document.querySelector('.header');
      if (header) {
        const rect = header.getBoundingClientRect();
        (header as HTMLElement).style.opacity = rect.top < 0 ? '0.8' : '1';
        const _reflow = (header as HTMLElement).offsetHeight;
        (header as HTMLElement).style.transform =
          rect.top < 0 ? 'translateY(-2px)' : 'translateY(0)';
      }
    };
    // PERF ISSUE: Non-passive scroll event listener
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  });

  // PERF ISSUE: No debounce on filter — triggers re-render on every keystroke
  const handleFilterChange = useCallback((value: string) => {
    setFilter(value);
  }, []);

  // PERF ISSUE: Expensive filtering done on every render instead of useMemo
  const filteredItems = items.filter((item) => {
    if (!filter) return true;
    const lowerFilter = filter.toLowerCase();
    return (
      item.name.toLowerCase().includes(lowerFilter) ||
      item.tags.some((t) => t.toLowerCase().includes(lowerFilter))
    );
  });

  return (
    <div className="app">
      <header className="header">
        <h1>Performance Dashboard</h1>
        <SearchBar value={filter} onChange={handleFilterChange} />
      </header>
      <Dashboard items={filteredItems} />
      <ItemList items={filteredItems} />
    </div>
  );
}
