'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTheme } from 'next-themes';
import { COMMAND, TERMINAL_LINES } from './terminal-data';
import type { LineDefinition } from './terminal-data';

interface TerminalAnimationProps {
  autoPlay?: boolean;
  onComplete?: () => void;
  className?: string;
}

const TerminalLine = memo(function TerminalLine({ line }: { line: LineDefinition }) {
  if (line.text === '') return <div className="h-[1.5em]" />;
  if (line.segments) {
    return (
      <div className="whitespace-pre">
        {line.segments.map((seg, i) => (
          <span key={i} className={seg.className}>
            {seg.text}
          </span>
        ))}
      </div>
    );
  }
  return <div className={`whitespace-pre ${line.className || ''}`}>{line.text}</div>;
});

export function TerminalAnimation({
  autoPlay = true,
  onComplete,
  className,
}: TerminalAnimationProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = !mounted || resolvedTheme !== 'light';

  const [phase, setPhase] = useState<'idle' | 'typing' | 'streaming' | 'done'>('idle');
  const [typedText, setTypedText] = useState('');
  const [visibleLineCount, setVisibleLineCount] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const isUserScrolled = useRef(false);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const nextLineTimeRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const prefersReducedMotion = useRef(false);

  // Keep onComplete ref current without triggering re-renders
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Detect prefers-reduced-motion on mount
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Start animation helper
  const startAnimation = useCallback(() => {
    if (prefersReducedMotion.current) {
      setTypedText(COMMAND);
      setVisibleLineCount(TERMINAL_LINES.length);
      setPhase('done');
      onCompleteRef.current?.();
      return;
    }
    setPhase('typing');
  }, []);

  // IntersectionObserver for autoPlay
  useEffect(() => {
    if (!autoPlay) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && phase === 'idle') {
          startAnimation();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoPlay, phase, startAnimation]);

  // Phase 1: Typing
  useEffect(() => {
    if (phase !== 'typing') return;

    let charIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const typeNext = () => {
      if (charIndex < COMMAND.length) {
        charIndex++;
        setTypedText(COMMAND.slice(0, charIndex));
        const jitter = Math.random() * 30 - 15;
        timeoutId = setTimeout(typeNext, 60 + jitter);
      } else {
        // Command fully typed — pause then start streaming
        timeoutId = setTimeout(() => {
          setPhase('streaming');
        }, 500);
      }
    };

    timeoutId = setTimeout(typeNext, 60);
    return () => clearTimeout(timeoutId);
  }, [phase]);

  // Phases 2-6: Line streaming via requestAnimationFrame
  useEffect(() => {
    if (phase !== 'streaming') return;

    let lineIndex = 0;
    startTimeRef.current = performance.now();
    nextLineTimeRef.current = TERMINAL_LINES[0]?.delay ?? 0;

    const step = (now: number) => {
      const elapsed = now - startTimeRef.current;

      while (lineIndex < TERMINAL_LINES.length && elapsed >= nextLineTimeRef.current) {
        lineIndex++;
        setVisibleLineCount(lineIndex);

        if (lineIndex < TERMINAL_LINES.length) {
          nextLineTimeRef.current += TERMINAL_LINES[lineIndex].delay;
        }
      }

      if (lineIndex < TERMINAL_LINES.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setPhase('done');
        onCompleteRef.current?.();
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Auto-scroll when new lines appear
  useEffect(() => {
    const el = terminalRef.current;
    if (el && !isUserScrolled.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleLineCount, typedText]);

  const handleScroll = useCallback(() => {
    const el = terminalRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    isUserScrolled.current = !atBottom;
  }, []);

  const replay = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setTypedText('');
    setVisibleLineCount(0);
    isUserScrolled.current = false;
    setPhase('idle');
    // Use microtask to ensure state resets before restarting
    queueMicrotask(() => {
      startAnimation();
    });
  }, [startAnimation]);

  return (
    <div
      className={`relative w-full max-w-3xl mx-auto aspect-4/3 ${className || ''}`}
      aria-label="Terminal animation showing zeitzeuge Vitest integration"
      ref={containerRef}
    >
      {/* Absolute inner shell — locked to the aspect-ratio box */}
      <div
        className="absolute inset-0 flex flex-col rounded-xl border border-border shadow-2xl overflow-hidden"
        data-theme={isDark ? 'dark' : 'light'}
      >
        {/* macOS title bar */}
        <div
          className="flex items-center shrink-0 px-4 py-2.5 border-b"
          style={{
            background: isDark ? '#2d2d2d' : '#e8e8e8',
            borderColor: isDark ? '#1a1a1a' : '#d0d0d0',
          }}
        >
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span
            className="flex-1 text-center text-xs font-mono"
            style={{ color: isDark ? '#808080' : '#999' }}
          >
            alex — vitest run — 80×24
          </span>
          {phase === 'done' && (
            <button
              onClick={replay}
              aria-label="Replay terminal animation"
              className="transition-colors cursor-pointer"
              style={{ color: isDark ? '#808080' : '#999' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          )}
        </div>

        {/* Terminal body */}
        <div
          ref={terminalRef}
          onScroll={handleScroll}
          role="log"
          aria-live={phase === 'done' ? 'off' : 'polite'}
          className="terminal-body p-4 overflow-y-auto overflow-x-hidden
                     font-mono text-[10px] sm:text-[11px] lg:text-[12px] leading-relaxed
                     flex-1 min-h-0"
          style={{
            background: isDark ? '#1a1a2e' : '#f5f5f5',
            color: isDark ? '#c8c8c8' : '#1e1e1e',
          }}
        >
          {/* Command line */}
          {phase !== 'idle' && (
            <div className="whitespace-pre">
              <span className="term-prompt">$ </span>
              <span className="term-command">{typedText}</span>
              {phase === 'typing' && <span className="terminal-cursor">▋</span>}
            </div>
          )}

          {/* Output lines */}
          {TERMINAL_LINES.slice(0, visibleLineCount).map((line, i) => (
            <TerminalLine key={i} line={line} />
          ))}
        </div>
      </div>
    </div>
  );
}
