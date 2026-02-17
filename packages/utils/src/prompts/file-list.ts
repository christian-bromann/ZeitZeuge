/**
 * File list injection utilities for Deep Agent subagent prompts.
 *
 * These utilities ensure subagents see exact file paths at the TOP of
 * their system prompts, so they read files directly without ls/glob.
 */

/** A file entry for the file list prompt section. */
export interface FileListEntry {
  /** Workspace path, e.g. "/heap/summary.json" */
  path: string;
  /** Optional description, e.g. "(hot functions with selfTime, selfPercent)" */
  description?: string;
}

/** Configuration for building a file list prompt section. */
export interface FileListConfig {
  /** Data/JSON files the subagent should read. */
  dataFiles: FileListEntry[];
  /** Application source files (the subagent MUST read ALL of these in the first turn). */
  sourceFiles?: string[];
  /** Test files (optional additional context). */
  testFiles?: string[];
  /** Additional named sections of files. */
  additionalSections?: Array<{ title: string; files: string[] }>;
}

/**
 * Build the file-list section that gets injected near the TOP of each
 * subagent's system prompt.
 *
 * This ensures subagents see the exact file paths FIRST, before any analysis
 * instructions, so they read files directly without ls/glob discovery.
 */
export function buildFileListPromptSection(config: FileListConfig): string {
  const { dataFiles, sourceFiles, testFiles, additionalSections } = config;

  const lines: string[] = [
    '## FILES IN THIS WORKSPACE — Read these directly. Do NOT use ls or glob.',
    '',
    '### Data files',
  ];

  for (const file of dataFiles) {
    if (file.description) {
      lines.push(`- ${file.path} ${file.description}`);
    } else {
      lines.push(`- ${file.path}`);
    }
  }

  if (sourceFiles && sourceFiles.length > 0) {
    lines.push('', '### Application source files — you MUST read ALL of these in your FIRST turn');
    for (const f of sourceFiles) {
      lines.push(`- ${f}`);
    }
  }

  if (testFiles && testFiles.length > 0) {
    lines.push('', '### Test files');
    for (const f of testFiles) {
      lines.push(`- ${f}`);
    }
  }

  if (additionalSections) {
    for (const section of additionalSections) {
      lines.push('', `### ${section.title}`);
      for (const f of section.files) {
        lines.push(`- ${f}`);
      }
    }
  }

  lines.push('', '> IMPORTANT: The file paths above are COMPLETE. Do NOT use ls or glob to');
  lines.push('> discover files. Just call read_file for each path listed above.');

  return lines.join('\n');
}

/**
 * Insert the file list section near the TOP of a subagent prompt,
 * right after the intro paragraph(s) and before the first ## heading.
 *
 * This ensures the file list is one of the first things the agent reads,
 * not buried at the bottom of a long prompt.
 */
export function insertFileListIntoPrompt(prompt: string, fileSection: string): string {
  if (!fileSection) return prompt;

  // Find the first ## heading in the prompt
  const firstHeadingIdx = prompt.indexOf('\n## ');
  if (firstHeadingIdx === -1) {
    // No headings found, append at end
    return prompt + '\n\n' + fileSection;
  }

  // Insert the file list between the intro paragraphs and the first heading
  return (
    prompt.slice(0, firstHeadingIdx) + '\n\n' + fileSection + '\n' + prompt.slice(firstHeadingIdx)
  );
}
