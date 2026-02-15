/**
 * PERF ISSUE [Excessive Instantiation]: Compiles a new RegExp on every
 * call. The pattern is static and should be a module-level constant.
 */
export function validateEmail(email: string): boolean {
  const emailRegex = new RegExp('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
  return emailRegex.test(email);
}

/**
 * Validates a task title against several rules.
 *
 * PERF ISSUE [Excessive Instantiation]: Every rule compiles its own
 * RegExp on every invocation instead of reusing precompiled patterns.
 */
export function validateTaskTitle(title: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!new RegExp('^[a-zA-Z]').test(title)) {
    errors.push('Title must start with a letter');
  }
  if (!new RegExp('^.{3,100}$').test(title)) {
    errors.push('Title must be between 3 and 100 characters');
  }
  if (new RegExp('[<>{}]').test(title)) {
    errors.push('Title contains invalid characters');
  }
  if (new RegExp('^\\s+|\\s+$').test(title)) {
    errors.push('Title must not have leading or trailing whitespace');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an array of tags.
 *
 * PERF ISSUE [Excessive Instantiation]: Compiles a RegExp per tag.
 * PERF ISSUE [Slow Code Path]: O(n²) duplicate detection — for each tag,
 * filters the entire array to count occurrences.
 */
export function validateTags(tags: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const tag of tags) {
    const tagRegex = new RegExp('^[a-z0-9-]{1,30}$');
    if (!tagRegex.test(tag)) {
      errors.push(`Invalid tag: "${tag}"`);
    }

    // PERF ISSUE [Slow Code Path]: O(n) filter inside an O(n) loop
    // results in O(n²) work. A Set-based approach would be O(n).
    const duplicateCount = tags.filter((t) => t.toLowerCase() === tag.toLowerCase()).length;
    if (duplicateCount > 1) {
      errors.push(`Duplicate tag: "${tag}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks that a title is unique among existing titles.
 *
 * PERF ISSUE [Slow Code Path]: Normalizes the entire array on every
 * call instead of maintaining a pre-normalized index.
 */
export function validateUniqueTitle(title: string, existingTitles: string[]): boolean {
  const normalized = existingTitles.map((t) => t.toLowerCase().trim());
  return !normalized.includes(title.toLowerCase().trim());
}
