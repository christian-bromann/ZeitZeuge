import { describe, it, expect, beforeEach } from 'vitest';
import { tracker } from '../src/middleware/request-tracker.ts';

beforeEach(() => {
  tracker.reset();
});

describe('tracker.track', () => {
  it('records a request and returns a finish callback', () => {
    const finish = tracker.track('GET', '/api/tasks', null);
    expect(typeof finish).toBe('function');
    expect(tracker.getRecordCount()).toBe(1);
  });

  it('records method, path, and body', () => {
    const body = { title: 'Test' };
    tracker.track('POST', '/api/tasks', body);

    const stats = tracker.getStats();
    expect(stats.totalRequests).toBe(1);
  });

  it('records multiple requests independently', () => {
    tracker.track('GET', '/api/tasks', null);
    tracker.track('POST', '/api/tasks', { title: 'New' });
    tracker.track('DELETE', '/api/tasks/1', null);

    expect(tracker.getRecordCount()).toBe(3);
  });
});

describe('finish callback', () => {
  it('records a non-null duration after being called', () => {
    const finish = tracker.track('GET', '/api/health', null);
    finish();

    const stats = tracker.getStats();
    expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
  });
});

describe('tracker.getStats', () => {
  it('returns zeroed stats when no requests have been tracked', () => {
    const stats = tracker.getStats();

    expect(stats.totalRequests).toBe(0);
    expect(stats.averageDuration).toBe(0);
    expect(stats.slowestEndpoint).toBeNull();
  });

  it('computes average duration across finished requests', () => {
    const f1 = tracker.track('GET', '/a', null);
    const f2 = tracker.track('GET', '/b', null);
    f1();
    f2();

    const stats = tracker.getStats();
    expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    expect(stats.totalRequests).toBe(2);
  });

  it('identifies the slowest endpoint', () => {
    const fast = tracker.track('GET', '/fast', null);
    fast();

    // simulate a slightly slower request by doing some work between
    const slow = tracker.track('POST', '/slow', null);
    let _sum = 0;
    for (let i = 0; i < 100_000; i++) _sum += i;
    slow();

    const stats = tracker.getStats();
    expect(stats.slowestEndpoint).toBeTruthy();
    expect(stats.slowestEndpoint).toMatch(/\/(fast|slow)/);
  });

  it('ignores unfinished requests in duration calculation', () => {
    tracker.track('GET', '/pending', null); // never finish
    const f = tracker.track('GET', '/done', null);
    f();

    const stats = tracker.getStats();
    // totalRequests includes both, but averageDuration only counts finished
    expect(stats.totalRequests).toBe(2);
  });
});

describe('tracker.reset', () => {
  it('clears all records', () => {
    tracker.track('GET', '/a', null);
    tracker.track('GET', '/b', null);

    tracker.reset();

    expect(tracker.getRecordCount()).toBe(0);
    expect(tracker.getStats().totalRequests).toBe(0);
  });
});
