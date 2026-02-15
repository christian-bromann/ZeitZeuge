'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-green-400"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-muted"
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <path d="M8 12V8h-.4L6 10.5 4.4 8H4v4" />
      <path d="M12 10l2 2 2-2" />
      <path d="M14 12V8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export function AiActions() {
  const [open, setOpen] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2000);
  }, []);

  const copyPage = useCallback(async () => {
    const isDocPage = pathname.startsWith('/docs/') && pathname !== '/docs';
    if (isDocPage) {
      const slug = pathname.replace('/docs/', '');
      try {
        const res = await fetch(`/api/docs/${slug}`);
        const md = await res.text();
        await copyToClipboard(md, 'copy-page');
      } catch {
        await copyToClipboard(document.body.innerText, 'copy-page');
      }
    } else {
      await copyToClipboard(document.body.innerText, 'copy-page');
    }
  }, [pathname, copyToClipboard]);

  const mcpUrl = `${origin}/api/mcp`;
  const mdUrl =
    pathname.startsWith('/docs/') && pathname !== '/docs' ? `${origin}${pathname}.md` : null;

  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=zeitzeuge-docs&type=http&url=${encodeURIComponent(mcpUrl)}`;
  const vscodeDeeplink = `vscode://anysphere.cursor-deeplink/mcp/install?name=zeitzeuge-docs&type=http&url=${encodeURIComponent(mcpUrl)}`;

  const chatGptUrl = `https://chatgpt.com/?q=${encodeURIComponent(`Read ${origin}${pathname} and answer my questions about it`)}`;
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(`Read ${origin}${pathname} and answer my questions about it`)}`;

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover hover:scale-105 transition-all cursor-pointer"
        aria-label="AI Actions"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-16 right-0 w-72 rounded-xl border border-border bg-surface shadow-xl p-1.5 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2">
          {/* Copy page */}
          <MenuItem
            icon={<CopyIcon />}
            label="Copy page"
            description="Copy page as Markdown for LLMs"
            onClick={copyPage}
            copied={copiedItem === 'copy-page'}
          />

          {/* View as Markdown */}
          {mdUrl && (
            <MenuLink
              icon={<MarkdownIcon />}
              label="View as Markdown"
              description="View this page as plain text"
              href={mdUrl}
            />
          )}

          {/* llms.txt */}
          <MenuLink
            icon={<FileIcon />}
            label="llms.txt"
            description="Open llms.txt for this site"
            href="/llms.txt"
          />

          <Separator />

          {/* Open in ChatGPT */}
          <MenuLink
            icon={<ChatGPTIcon />}
            label="Open in ChatGPT"
            description="Ask questions about this page"
            href={chatGptUrl}
          />

          {/* Open in Claude */}
          <MenuLink
            icon={<ClaudeIcon />}
            label="Open in Claude"
            description="Ask questions about this page"
            href={claudeUrl}
          />

          <Separator />

          {/* Copy MCP Server URL */}
          <MenuItem
            icon={<LinkIcon />}
            label="Copy MCP Server"
            description="Copy MCP Server URL to clipboard"
            onClick={() => copyToClipboard(mcpUrl, 'mcp-url')}
            copied={copiedItem === 'mcp-url'}
          />

          {/* Connect to Cursor */}
          <MenuLink
            icon={<CursorIcon />}
            label="Connect to Cursor"
            description="Install MCP Server in Cursor"
            href={cursorDeeplink}
          />

          {/* Connect to VS Code */}
          <MenuLink
            icon={<VSCodeIcon />}
            label="Connect to VS Code"
            description="Install MCP Server in VS Code"
            href={vscodeDeeplink}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  copied,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  copied?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-foreground hover:bg-surface-alt cursor-pointer transition-colors text-left"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-background shrink-0 text-text-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-text-muted truncate">{description}</div>
      </div>
      <div className="w-4 h-4 shrink-0">{copied && <CheckIcon />}</div>
    </button>
  );
}

function MenuLink({
  icon,
  label,
  description,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-foreground hover:bg-surface-alt transition-colors no-underline"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-background shrink-0 text-text-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {label} <ExternalIcon />
        </div>
        <div className="text-xs text-text-muted truncate">{description}</div>
      </div>
    </a>
  );
}

function Separator() {
  return <div className="h-px bg-border my-1.5" />;
}

function ChatGPTIcon() {
  return (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z" />
    </svg>
  );
}

function ClaudeIcon() {
  return (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 257">
      <path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 100 100" fill="currentColor">
      <path d="M10 90 L50 10 L90 90 L50 70 Z" />
    </svg>
  );
}

function VSCodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 100 100" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M70.9119 99.3171C72.4869 99.9307 74.2828 99.8914 75.8725 99.1264L96.4608 89.2197C98.6242 88.1787 100 85.9892 100 83.5872V16.4133C100 14.0113 98.6243 11.8218 96.4609 10.7808L75.8725 0.873756C73.7862 -0.130129 71.3446 0.11576 69.5135 1.44695C69.252 1.63711 69.0028 1.84943 68.769 2.08341L29.3551 38.0415L12.1872 25.0096C10.589 23.7965 8.35363 23.8959 6.86933 25.2461L1.36303 30.2549C-0.452552 31.9064 -0.454633 34.7627 1.35853 36.417L16.2471 50.0001L1.35853 63.5832C-0.454633 65.2374 -0.452552 68.0938 1.36303 69.7453L6.86933 74.7541C8.35363 76.1043 10.589 76.2037 12.1872 74.9905L29.3551 61.9587L68.769 97.9167C69.3925 98.5406 70.1246 99.0104 70.9119 99.3171ZM75.0152 27.2989L45.1091 50.0001L75.0152 72.7012V27.2989Z"
      />
    </svg>
  );
}
