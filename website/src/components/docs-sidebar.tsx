'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface SidebarLink {
  slug: string;
  title: string;
}

export function DocsSidebar({ links }: { links: SidebarLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden flex items-center gap-2 text-sm text-text-muted hover:text-foreground transition-colors mb-4 cursor-pointer"
      >
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
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Docs Menu
      </button>

      <aside className={`${open ? 'block' : 'hidden'} lg:block w-full lg:w-60 shrink-0`}>
        <nav className="sticky top-20 space-y-1">
          {links.map((link) => {
            const href = `/docs/${link.slug}`;
            const isActive = pathname === href;
            return (
              <Link
                key={link.slug}
                href={href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-subtle text-primary font-medium'
                    : 'text-text-muted hover:text-foreground hover:bg-surface-alt'
                }`}
              >
                {link.title}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
