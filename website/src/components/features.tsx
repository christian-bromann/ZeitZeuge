import type { ReactNode } from 'react';

function GlobeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a4 4 0 0 0-4 4v1a4 4 0 0 0-4 4 4 4 0 0 0 2.38 3.65A4 4 0 0 0 9 19h2" />
      <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1 4 4 4 4 0 0 1-2.38 3.65A4 4 0 0 1 15 19h-2" />
      <path d="M12 2v20" />
      <path d="M8 9h2" />
      <path d="M14 9h2" />
      <path d="M8 15h2" />
      <path d="M14 15h2" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}

const FEATURES: { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <GlobeIcon />,
    title: 'Page-Load Analysis',
    description:
      'Launch Chrome, capture heap snapshots, performance traces, runtime traces, and all network assets in a single page load.',
  },
  {
    icon: <ZapIcon />,
    title: 'Test Runner Integrations',
    description:
      'Profile your test suite with Vitest, Node.js test runner, or Bun — V8 CPU profiling and AI analysis of your application code.',
  },
  {
    icon: <BrainIcon />,
    title: 'Deep Agent Investigation',
    description:
      'A LangChain Deep Agent autonomously browses a virtual filesystem, reads source code, and correlates heap + trace + runtime data.',
  },
  {
    icon: <WrenchIcon />,
    title: 'Code-Level Fixes',
    description:
      'Get actionable suggestions — memory leaks, frame-blocking functions, listener leaks, render-blocking scripts — with line-number precision.',
  },
  {
    icon: <ActivityIcon />,
    title: 'Runtime Trace Analysis',
    description:
      'Captures every function call, event dispatch, layout, paint, and GC event on the main thread via the Chrome Tracing domain.',
  },
  {
    icon: <SparklesIcon />,
    title: 'Zero Config',
    description:
      'Set an API key, run npx zeitzeuge <url> — done. For test runners, add one plugin line or CLI flag.',
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-surface p-6 hover:border-primary/40 transition-colors shadow-sm"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-subtle text-primary mb-4">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">{feature.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
