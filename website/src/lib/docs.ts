import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { codeToHtml } from 'shiki';

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
}

export interface Doc extends DocMeta {
  content: string;
  rawMarkdown: string;
}

const DOCS_DIR = path.join(process.cwd(), '..', 'docs');

export function getDocSlugs(): string[] {
  if (!fs.existsSync(DOCS_DIR)) return [];
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

export function getDocMetas(): DocMeta[] {
  return getDocSlugs()
    .map((slug) => {
      const filePath = path.join(DOCS_DIR, `${slug}.md`);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(raw);
      return {
        slug,
        title: (data.title as string) || slug,
        description: (data.description as string) || '',
        order: (data.order as number) || 99,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export async function getDoc(slug: string): Promise<Doc | null> {
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content: markdownBody } = matter(raw);

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdownBody);

  let html = String(result);

  // Post-process code blocks: extract <pre><code> and syntax-highlight with shiki
  const codeBlockRegex = /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g;
  const matches = [...html.matchAll(codeBlockRegex)];

  for (const match of matches) {
    const lang = match[1];
    const code = match[2]
      .replace(/&#x3C;/gi, '<')
      .replace(/&#x3E;/gi, '>')
      .replace(/&#60;/g, '<')
      .replace(/&#62;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const highlighted = await codeToHtml(code, {
      lang,
      themes: { dark: 'one-dark-pro', light: 'github-light' },
      defaultColor: false,
    });
    html = html.replace(match[0], highlighted);
  }

  return {
    slug,
    title: (data.title as string) || slug,
    description: (data.description as string) || '',
    order: (data.order as number) || 99,
    content: html,
    rawMarkdown: raw,
  };
}

export function getRawMarkdown(slug: string): string | null {
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}
