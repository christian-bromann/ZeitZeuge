import { test, expect, describe } from 'bun:test';
import {
  detectVisualChanges,
  buildFilmstrip,
  approximateSpeedIndex,
} from '../../src/browser/screencast';
import type { ScreencastFrame } from '@zeitzeuge/utils';

function createFrame(timestamp: number, dataLength: number, index?: number): ScreencastFrame {
  return {
    timestamp,
    data: 'x'.repeat(Math.ceil(dataLength / 0.75)),
    sessionId: index ?? 0,
    dataLength,
  };
}

describe('detectVisualChanges', () => {
  test('returns empty for empty frames', () => {
    expect(detectVisualChanges([])).toEqual([]);
  });

  test('returns empty when final frame has zero data length', () => {
    const frames = [createFrame(0, 0), createFrame(100, 0)];
    expect(detectVisualChanges(frames)).toEqual([]);
  });

  test('detects initial content as a visual change', () => {
    const frames = [createFrame(100, 500), createFrame(200, 500), createFrame(300, 500)];
    const changes = detectVisualChanges(frames);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0].frameIndex).toBe(0);
    expect(changes[0].timestamp).toBe(100);
  });

  test('detects significant size jumps as visual changes', () => {
    const frames = [
      createFrame(0, 100),
      createFrame(100, 100),
      createFrame(200, 300),
      createFrame(300, 300),
      createFrame(400, 1000),
    ];
    const changes = detectVisualChanges(frames);
    const changeIndices = changes.map((c) => c.frameIndex);
    expect(changeIndices).toContain(0);
    expect(changeIndices).toContain(2);
    expect(changeIndices).toContain(4);
  });

  test('ignores minor size fluctuations below threshold', () => {
    const frames = [
      createFrame(0, 1000),
      createFrame(100, 1050),
      createFrame(200, 1020),
      createFrame(300, 1080),
    ];
    const changes = detectVisualChanges(frames);
    expect(changes.length).toBe(1);
    expect(changes[0].frameIndex).toBe(0);
  });

  test('visual completeness is relative to final frame', () => {
    const frames = [createFrame(0, 250), createFrame(100, 500), createFrame(200, 1000)];
    const changes = detectVisualChanges(frames);
    const firstChange = changes.find((c) => c.frameIndex === 0);
    expect(firstChange).toBeDefined();
    expect(firstChange!.visualCompleteness).toBe(25);
  });

  test('visual completeness caps at 100', () => {
    const frames = [createFrame(0, 500), createFrame(100, 400)];
    const changes = detectVisualChanges(frames);
    for (const c of changes) {
      expect(c.visualCompleteness).toBeLessThanOrEqual(100);
    }
  });
});

describe('buildFilmstrip', () => {
  test('builds summaries for all frames', () => {
    const frames = [createFrame(0, 100), createFrame(50, 200), createFrame(100, 300)];
    const changes = detectVisualChanges(frames);
    const filmstrip = buildFilmstrip(frames, changes);

    expect(filmstrip.length).toBe(3);
    expect(filmstrip[0].index).toBe(0);
    expect(filmstrip[1].index).toBe(1);
    expect(filmstrip[2].index).toBe(2);
  });

  test('marks visual change frames correctly', () => {
    const frames = [createFrame(0, 100), createFrame(50, 100), createFrame(100, 500)];
    const changes = detectVisualChanges(frames);
    const filmstrip = buildFilmstrip(frames, changes);

    const changeIndices = new Set(changes.map((c) => c.frameIndex));
    for (const frame of filmstrip) {
      expect(frame.isVisualChange).toBe(changeIndices.has(frame.index));
    }
  });

  test('includes timestamp and data length', () => {
    const frames = [createFrame(42, 256)];
    const filmstrip = buildFilmstrip(frames, []);
    expect(filmstrip[0].timestamp).toBe(42);
    expect(filmstrip[0].dataLength).toBe(256);
  });
});

describe('approximateSpeedIndex', () => {
  test('returns 0 for empty visual changes', () => {
    expect(approximateSpeedIndex([])).toBe(0);
  });

  test('returns 0 when only change is at timestamp 0 with 100% completeness', () => {
    const changes = [{ timestamp: 0, frameIndex: 0, visualCompleteness: 100, changeMagnitude: 1 }];
    expect(approximateSpeedIndex(changes)).toBe(0);
  });

  test('higher speed index for slower visual progress', () => {
    const fastProgress = [
      { timestamp: 100, frameIndex: 0, visualCompleteness: 80, changeMagnitude: 0.8 },
      { timestamp: 200, frameIndex: 1, visualCompleteness: 100, changeMagnitude: 0.2 },
    ];
    const slowProgress = [
      { timestamp: 100, frameIndex: 0, visualCompleteness: 20, changeMagnitude: 0.2 },
      { timestamp: 200, frameIndex: 1, visualCompleteness: 100, changeMagnitude: 0.8 },
    ];
    const fastSI = approximateSpeedIndex(fastProgress);
    const slowSI = approximateSpeedIndex(slowProgress);
    expect(slowSI).toBeGreaterThan(fastSI);
  });

  test('speed index reflects visual completeness progression', () => {
    const progressive = [
      { timestamp: 100, frameIndex: 0, visualCompleteness: 25, changeMagnitude: 0.25 },
      { timestamp: 200, frameIndex: 1, visualCompleteness: 50, changeMagnitude: 0.25 },
      { timestamp: 300, frameIndex: 2, visualCompleteness: 75, changeMagnitude: 0.25 },
      { timestamp: 400, frameIndex: 3, visualCompleteness: 100, changeMagnitude: 0.25 },
    ];
    const si = approximateSpeedIndex(progressive);
    expect(si).toBeGreaterThan(0);
    expect(si).toBeLessThan(400);
  });
});
