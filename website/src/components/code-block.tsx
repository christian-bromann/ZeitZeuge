import { codeToHtml } from 'shiki';
import { CopyButton } from './copy-button';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

export async function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const html = await codeToHtml(code.trim(), {
    lang: language,
    themes: {
      dark: 'one-dark-pro',
      light: 'github-light',
    },
    defaultColor: false,
  });

  return (
    <div className="relative group rounded-lg border border-border overflow-hidden shadow-sm">
      {filename && (
        <div className="text-xs text-text-muted px-4 pt-2 pb-0 font-mono bg-code-bg border-b border-border-subtle">
          {filename}
        </div>
      )}
      <div
        className="[&_pre]:p-6 [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:leading-relaxed [&_.shiki]:!bg-code-bg"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CopyButton text={code.trim()} />
    </div>
  );
}
