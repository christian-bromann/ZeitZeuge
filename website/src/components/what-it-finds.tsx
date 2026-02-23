const PAGE_LOAD_FINDINGS = [
  'Memory leaks, detached DOM nodes, closure leaks',
  'Render-blocking scripts & stylesheets',
  'Long main-thread tasks (> 50ms)',
  'Frame-blocking functions with exact source locations',
  'Event listener leaks',
  'GC pressure & layout thrashing',
];

const TEST_RUNNER_FINDINGS = [
  'Hot functions with high self time in your source code',
  'Expensive algorithms (O(n\u00B2) loops, redundant computation)',
  'Dependency bottlenecks',
  'GC pressure from short-lived allocations',
  'Event listener leaks',
  'Blocking I/O in hot paths',
];

export function WhatItFinds() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-center mb-12 text-foreground">What It Finds</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
              <span>🌐</span> Page Load
            </h3>
            <ul className="space-y-2.5">
              {PAGE_LOAD_FINDINGS.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-text-secondary">
                  <span className="text-primary mt-0.5 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
              <span>⚡</span> Test Runners
            </h3>
            <p className="text-xs text-text-muted mb-3">Vitest · Node.js · Bun</p>
            <ul className="space-y-2.5">
              {TEST_RUNNER_FINDINGS.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-text-secondary">
                  <span className="text-primary mt-0.5 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
