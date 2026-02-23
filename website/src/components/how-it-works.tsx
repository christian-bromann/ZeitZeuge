'use client';

import { useState } from 'react';

const TABS = [
  {
    label: 'Page Load',
    steps: [
      'Launches Chrome via WebdriverIO with DevTools Protocol access',
      'Captures heap snapshot + performance trace + runtime trace + network assets',
      'Builds a VFS workspace with all captured data',
      'Deep Agent explores the workspace and correlates findings',
      'Markdown report written to disk with code-level fixes',
    ],
  },
  {
    label: 'Vitest',
    steps: [
      'Plugin instruments Vitest with --cpu-prof for V8 profiling',
      'V8 CPU profiles captured per test file during the run',
      'Hot functions classified as application / dependency / test / framework',
      'VFS workspace built with profiles + actual source code',
      'Deep Agent analyzes application code bottlenecks',
    ],
  },
  {
    label: 'Node.js',
    steps: [
      'Run node --test with --cpu-prof and the zeitzeuge reporter',
      'V8 CPU profiles captured per forked test process',
      'Reporter extracts timing from test:pass / test:fail events',
      'Hot functions classified and workspace built with source code',
      'Deep Agent analyzes application code bottlenecks',
    ],
  },
  {
    label: 'Bun',
    steps: [
      'Run bun test with the zeitzeuge preload script',
      'CPU profiles captured in V8-compatible format',
      'Preload script records per-test timing via lifecycle hooks',
      'Hot functions classified and workspace built with source code',
      'Deep Agent analyzes application code bottlenecks',
    ],
  },
];

export function HowItWorks() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section className="py-20 sm:py-24 bg-surface-alt">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-center mb-10 text-foreground">How It Works</h2>

        <div className="flex justify-center gap-2 mb-8">
          {TABS.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === i
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-secondary hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ol className="space-y-4">
          {TABS[activeTab].steps.map((step, i) => (
            <li key={i} className="flex gap-4 items-start">
              <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary-subtle text-primary text-sm font-bold">
                {i + 1}
              </span>
              <p className="text-text-secondary pt-1 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
