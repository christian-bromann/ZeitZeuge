import React, { useEffect, useRef, useState } from 'react';

interface Item {
  id: number;
  name: string;
  tags: string[];
}

interface DashboardProps {
  items: Item[];
}

export function Dashboard({ items }: DashboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ total: 0, tagged: 0, avgTags: 0 });

  // PERF ISSUE: DOM manipulation in a loop — creates elements one by one
  // instead of using React's virtual DOM or DocumentFragment
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const existing = container.querySelector('.chart-area');
    if (existing) container.removeChild(existing);

    const chartArea = document.createElement('div');
    chartArea.className = 'chart-area';

    for (let i = 0; i < Math.min(items.length, 50); i++) {
      const bar = document.createElement('div');
      bar.style.width = `${(items[i]!.tags.length / 10) * 100}%`;
      bar.style.height = '8px';
      bar.style.background = `hsl(${(i * 7) % 360}, 70%, 50%)`;
      bar.style.marginBottom = '2px';
      bar.style.borderRadius = '4px';
      bar.style.transition = 'width 0.3s ease';
      chartArea.appendChild(bar);
    }

    container.appendChild(chartArea);
  }, [items]);

  // PERF ISSUE: Expensive O(n²) computation on every render —
  // compares all pairs of items for tag overlap
  useEffect(() => {
    let _tagOverlapCount = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const tagsA = items[i]!.tags;
        const tagsB = items[j]!.tags;
        for (const ta of tagsA) {
          for (const tb of tagsB) {
            if (ta === tb) _tagOverlapCount++;
          }
        }
      }
    }

    const totalTags = items.reduce((sum, item) => sum + item.tags.length, 0);
    setStats({
      total: items.length,
      tagged: items.filter((i) => i.tags.length > 0).length,
      avgTags: items.length > 0 ? totalTags / items.length : 0,
    });
  }, [items]);

  // PERF ISSUE: Event listener leak — adds resize listener without cleanup
  useEffect(() => {
    const onResize = () => {
      const container = containerRef.current;
      if (container) {
        container.style.minHeight = `${window.innerHeight * 0.4}px`;
      }
    };
    window.addEventListener('resize', onResize);
    // Missing: return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="dashboard" ref={containerRef}>
      <div className="card">
        <h3>Total Items</h3>
        <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.total}</p>
      </div>
      <div className="card">
        <h3>Tagged Items</h3>
        <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.tagged}</p>
      </div>
      <div className="card">
        <h3>Avg Tags/Item</h3>
        <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.avgTags.toFixed(1)}</p>
      </div>
    </div>
  );
}
