import { describe, it, expect, beforeEach } from 'vitest';
import { cache } from '../src/services/cache-service.ts';

beforeEach(() => {
  cache.reset();
});

describe('cache.set / cache.get', () => {
  it('stores and retrieves a value by key', () => {
    cache.set('greeting', 'hello');
    expect(cache.get('greeting')).toBe('hello');
  });

  it('stores objects', () => {
    const data = { name: 'Alice', score: 42 };
    cache.set('user', data);

    const retrieved = cache.get('user') as typeof data;
    expect(retrieved.name).toBe('Alice');
    expect(retrieved.score).toBe(42);
  });

  it('stores arrays', () => {
    cache.set('list', [1, 2, 3]);
    expect(cache.get('list')).toEqual([1, 2, 3]);
  });

  it('returns undefined for a missing key', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('overwrites existing value on re-set', () => {
    cache.set('key', 'first');
    cache.set('key', 'second');

    expect(cache.get('key')).toBe('second');
    expect(cache.getStoreSize()).toBe(1);
  });

  it('returns a copy, not the original reference', () => {
    const original = { value: 'original' };
    cache.set('ref', original);

    const retrieved = cache.get('ref') as typeof original;
    retrieved.value = 'mutated';

    const fresh = cache.get('ref') as typeof original;
    expect(fresh.value).toBe('original');
  });

  it('handles multiple distinct keys', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('cache.getStats', () => {
  it('reports correct size', () => {
    expect(cache.getStats().size).toBe(0);

    cache.set('a', 1);
    cache.set('b', 2);

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.keys).toContain('a');
    expect(stats.keys).toContain('b');
  });

  it('tracks access log size from get calls', () => {
    cache.set('key', 'value');

    cache.get('key');
    cache.get('key');
    cache.get('key');

    expect(cache.getStats().accessLogSize).toBe(3);
  });

  it('does not count misses in the access log', () => {
    cache.get('missing');
    expect(cache.getStats().accessLogSize).toBe(0);
  });
});

describe('cache.reset', () => {
  it('clears all entries and the access log', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');

    cache.reset();

    expect(cache.getStoreSize()).toBe(0);
    expect(cache.getAccessLogSize()).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
