import { notFound } from 'next/navigation';
import { getDoc, getDocSlugs } from '@/lib/docs';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) return {};

  const ogUrl = `/og?title=${encodeURIComponent(doc.title)}${doc.description ? `&description=${encodeURIComponent(doc.description)}` : ''}`;

  return {
    title: doc.title,
    description: doc.description,
    openGraph: {
      title: doc.title,
      description: doc.description,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: doc.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: doc.title,
      description: doc.description,
      images: [ogUrl],
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) notFound();

  return <article dangerouslySetInnerHTML={{ __html: doc.content }} />;
}
