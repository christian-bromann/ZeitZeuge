export function Footer() {
  return (
    <footer className="border-t border-border py-8 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/christian-bromann/zeitzeuge"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <span>MIT License</span>
        </div>
        <span>
          Built with{' '}
          <a
            href="https://github.com/langchain-ai/langchainjs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors underline underline-offset-2"
          >
            LangChain
          </a>{' '}
          &amp;{' '}
          <a
            href="https://github.com/langchain-ai/deepagentsjs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors underline underline-offset-2"
          >
            Deep Agents
          </a>
        </span>
      </div>
    </footer>
  );
}
