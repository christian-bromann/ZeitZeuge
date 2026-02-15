import { describe, it, expect } from 'vitest';
import { hashPassword, generateToken } from '../src/utils/crypto.ts';

describe('hashPassword', () => {
  it('returns a hex string', () => {
    const hash = hashPassword('secret', 100);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns a deterministic result for the same input', () => {
    const a = hashPassword('password', 500);
    const b = hashPassword('password', 500);
    expect(a).toBe(b);
  });

  it('produces different hashes for different passwords', () => {
    const a = hashPassword('alpha', 500);
    const b = hashPassword('beta', 500);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different iteration counts', () => {
    const a = hashPassword('same', 100);
    const b = hashPassword('same', 200);
    expect(a).not.toBe(b);
  });

  it('output length matches input password byte length × 2 (hex encoding)', () => {
    const password = 'hello';
    const hash = hashPassword(password, 100);
    const expectedHexLen = new TextEncoder().encode(password).length * 2;
    expect(hash.length).toBe(expectedHexLen);
  });

  it('handles empty string', () => {
    const hash = hashPassword('', 100);
    expect(hash).toBe('');
  });

  it('handles unicode input', () => {
    const hash = hashPassword('café ☕', 100);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hash.length).toBeGreaterThan(0);
  });

  it('uses default iterations when not specified', () => {
    // should not throw
    const hash = hashPassword('test');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe('generateToken', () => {
  it('returns a hex string', () => {
    const token = generateToken(16);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generates different tokens on successive calls', () => {
    const a = generateToken(16);
    const b = generateToken(16);
    // Extremely unlikely to collide
    expect(a).not.toBe(b);
  });

  it('uses default length when not specified', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token.length).toBeGreaterThan(0);
  });

  it('respects custom length parameter', () => {
    const short = generateToken(8);
    const long = generateToken(64);

    // Token output length = input length * 2 (hex), since generateToken
    // hashes a string of the given length.
    expect(short.length).toBe(8 * 2);
    expect(long.length).toBe(64 * 2);
  });
});
