import { getDocMetas } from '@/lib/docs';
import { DocsSidebar } from '@/components/docs-sidebar';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const metas = getDocMetas();
  const links = metas.map((m) => ({ slug: m.slug, title: m.title }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col lg:flex-row gap-8">
      <DocsSidebar links={links} />
      <div className="flex-1 min-w-0 prose">{children}</div>
    </div>
  );
}
