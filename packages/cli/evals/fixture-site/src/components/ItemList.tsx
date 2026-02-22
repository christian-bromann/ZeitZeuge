import React, { useEffect, useRef } from 'react';

interface Item {
  id: number;
  name: string;
  tags: string[];
}

interface ItemListProps {
  items: Item[];
}

export function ItemList({ items }: ItemListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // PERF ISSUE: Storing detached DOM references that prevent GC
  const detachedNodes = useRef<HTMLElement[]>([]);

  useEffect(() => {
    // PERF ISSUE: Creating and storing detached DOM nodes
    // Every time items change, old nodes are kept in memory
    const nodes: HTMLElement[] = [];
    for (const item of items) {
      const div = document.createElement('div');
      div.textContent = `${item.name} (${item.tags.join(', ')})`;
      div.dataset.id = String(item.id);
      nodes.push(div);
    }
    detachedNodes.current = [...detachedNodes.current, ...nodes];
  }, [items]);

  // PERF ISSUE: Inline event handlers creating new closures on every render
  // + synchronous JSON serialization on every click
  const handleItemClick = (item: Item) => {
    const serialized = JSON.stringify(item);
    const parsed = JSON.parse(serialized);
    const copy = JSON.parse(JSON.stringify(parsed));

    console.log('Item clicked:', copy);

    // PERF ISSUE: Synchronous XHR (blocks main thread)
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/api/items/${item.id}`, false);
      xhr.send();
    } catch {
      // Expected to fail — demonstrating the anti-pattern
    }
  };

  return (
    <div style={{ marginTop: '24px' }}>
      <h2>Items ({items.length})</h2>
      <ul className="list" ref={listRef}>
        {items.map((item) => (
          <li key={item.id} className="list-item" onClick={() => handleItemClick(item)}>
            <strong>{item.name}</strong>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: '#e2e8f0',
                    borderRadius: '12px',
                    marginRight: '4px',
                    fontSize: '11px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
