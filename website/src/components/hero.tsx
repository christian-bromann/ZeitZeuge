import Image from 'next/image';
import Link from 'next/link';
import { CodeBlock } from './code-block';

export async function Hero() {
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* Subtle gradient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[400px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <Image
          src="/zeitzeuge.png"
          alt="zeitzeuge mascot"
          width={300}
          height={300}
          className="mx-auto drop-shadow-lg"
          priority
        />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 text-foreground">
          AI-Powered Performance Analysis
        </h1>
        <p className="text-lg sm:text-xl text-text-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
          Capture V8 heap snapshots, Chrome runtime traces, and CPU profiles — hand them to a Deep
          Agent that finds bottlenecks and suggests code-level fixes.
        </p>

        <div className="max-w-lg mx-auto mb-8">
          <CodeBlock code="npx zeitzeuge https://zeitzeuge.dev" language="bash" />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            Read the Docs
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
