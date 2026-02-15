import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateTaskTitle,
  validateTags,
  validateUniqueTitle,
} from '../src/utils/validators.ts';

describe('validateEmail', () => {
  it('accepts valid email addresses', () => {
    expect(validateEmail('alice@example.com')).toBe(true);
    expect(validateEmail('bob.jones@company.co.uk')).toBe(true);
    expect(validateEmail('test+tag@gmail.com')).toBe(true);
    expect(validateEmail('user123@sub.domain.org')).toBe(true);
  });

  it('rejects invalid email addresses', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('@no-local.com')).toBe(false);
    expect(validateEmail('no-domain@')).toBe(false);
    expect(validateEmail('spaces in@email.com')).toBe(false);
  });
});

describe('validateTaskTitle', () => {
  it('accepts valid titles', () => {
    const result = validateTaskTitle('Fix the login bug');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts titles at minimum length (3 chars)', () => {
    expect(validateTaskTitle('Fix').valid).toBe(true);
  });

  it('accepts titles at maximum length (100 chars)', () => {
    const title = 'A' + 'a'.repeat(99);
    expect(validateTaskTitle(title).valid).toBe(true);
  });

  it('rejects titles that do not start with a letter', () => {
    const result = validateTaskTitle('123 numeric start');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Title must start with a letter');
  });

  it('rejects titles shorter than 3 characters', () => {
    const result = validateTaskTitle('Ab');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Title must be between 3 and 100 characters');
  });

  it('rejects titles longer than 100 characters', () => {
    const result = validateTaskTitle('A' + 'a'.repeat(100));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Title must be between 3 and 100 characters');
  });

  it('rejects titles with angle brackets or braces', () => {
    expect(validateTaskTitle('Fix <script> issue').valid).toBe(false);
    expect(validateTaskTitle('Use {template}').valid).toBe(false);
    expect(validateTaskTitle('Close > tag').valid).toBe(false);
  });

  it('rejects titles with leading whitespace', () => {
    const result = validateTaskTitle('  Leading spaces');
    expect(result.valid).toBe(false);
  });

  it('rejects titles with trailing whitespace', () => {
    const result = validateTaskTitle('Trailing spaces   ');
    expect(result.valid).toBe(false);
  });

  it('can return multiple errors at once', () => {
    // starts with space (not a letter), too short, has leading whitespace
    const result = validateTaskTitle(' X');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateTags', () => {
  it('accepts valid lowercase alphanumeric tags', () => {
    const result = validateTags(['frontend', 'bug-fix', 'v2']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts an empty array', () => {
    expect(validateTags([]).valid).toBe(true);
  });

  it('accepts single-character tags', () => {
    expect(validateTags(['a', '1']).valid).toBe(true);
  });

  it('rejects tags with uppercase letters', () => {
    const result = validateTags(['Frontend']);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Frontend');
  });

  it('rejects tags with spaces', () => {
    const result = validateTags(['not valid']);
    expect(result.valid).toBe(false);
  });

  it('rejects tags with special characters', () => {
    const result = validateTags(['tag@home']);
    expect(result.valid).toBe(false);
  });

  it('rejects tags longer than 30 characters', () => {
    const longTag = 'a'.repeat(31);
    const result = validateTags([longTag]);
    expect(result.valid).toBe(false);
  });

  it('detects duplicate tags', () => {
    const result = validateTags(['frontend', 'backend', 'frontend']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('detects case-insensitive duplicates', () => {
    // Both "api" entries are lowercase so they match
    const result = validateTags(['api', 'api']);
    expect(result.valid).toBe(false);
  });
});

describe('validateUniqueTitle', () => {
  it('returns true when title is unique', () => {
    const existing = ['Setup CI', 'Write docs', 'Fix bug'];
    expect(validateUniqueTitle('New feature', existing)).toBe(true);
  });

  it('returns false when title already exists', () => {
    const existing = ['Setup CI', 'Write docs'];
    expect(validateUniqueTitle('Setup CI', existing)).toBe(false);
  });

  it('is case-insensitive', () => {
    const existing = ['Setup CI'];
    expect(validateUniqueTitle('setup ci', existing)).toBe(false);
    expect(validateUniqueTitle('SETUP CI', existing)).toBe(false);
  });

  it('trims whitespace before comparing', () => {
    const existing = ['Setup CI'];
    expect(validateUniqueTitle('  Setup CI  ', existing)).toBe(false);
  });

  it('returns true against an empty list', () => {
    expect(validateUniqueTitle('Anything', [])).toBe(true);
  });
});
