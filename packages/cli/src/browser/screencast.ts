import type { ScreencastFrame, FrameSummary, VisualChangePoint } from '@zeitzeuge/utils';

/**
 * Minimum relative change in frame data size to count as a visual change.
 * A 10% change in JPEG byte size reliably indicates new visible content.
 */
const VISUAL_CHANGE_THRESHOLD = 0.1;

/** Maximum frames to keep (cap memory usage during long page loads). */
const MAX_FRAMES = 200;

/** Handle returned by startScreencast — call stop() to end capture. */
export interface ScreencastHandle {
  /** Stop capturing and return collected frames. */
  stop(): Promise<ScreencastFrame[]>;
}

/**
 * Start capturing screencast frames via CDP `Page.startScreencast`.
 *
 * Frames are captured as low-quality JPEGs at a modest resolution to keep
 * memory usage reasonable while still allowing visual-change detection.
 *
 * @param cdpSession - Active CDP session (from Puppeteer page.createCDPSession())
 * @param navigationStartTs - High-resolution timestamp of navigation start (ms)
 */
export async function startScreencast(
  cdpSession: any,
  navigationStartTs: number,
): Promise<ScreencastHandle> {
  const frames: ScreencastFrame[] = [];

  cdpSession.on('Page.screencastFrame', (params: any) => {
    if (frames.length >= MAX_FRAMES) return;

    const dataLength = Math.ceil((params.data?.length ?? 0) * 0.75);

    frames.push({
      timestamp: params.metadata?.timestamp
        ? params.metadata.timestamp * 1000 - navigationStartTs
        : Date.now() - navigationStartTs,
      data: params.data ?? '',
      sessionId: params.sessionId ?? 0,
      dataLength,
    });

    try {
      cdpSession.send('Page.screencastFrameAck', {
        sessionId: params.sessionId,
      });
    } catch {
      // Ack failure is non-fatal
    }
  });

  try {
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 40,
      maxWidth: 800,
      maxHeight: 600,
      everyNthFrame: 1,
    });
  } catch {
    // Screencast not supported — return empty handle
    return { stop: async () => [] };
  }

  return {
    async stop(): Promise<ScreencastFrame[]> {
      try {
        await cdpSession.send('Page.stopScreencast');
      } catch {
        // Already stopped or not supported
      }
      return frames;
    },
  };
}

/**
 * Analyze screencast frames to detect visual change points.
 *
 * Uses frame data size as a proxy for visual content. Significant jumps in
 * JPEG byte size indicate new elements being rendered. This avoids needing
 * a pixel-level image comparison library.
 */
export function detectVisualChanges(frames: ScreencastFrame[]): VisualChangePoint[] {
  if (frames.length === 0) return [];

  const changes: VisualChangePoint[] = [];
  const finalSize = frames[frames.length - 1]!.dataLength;
  if (finalSize === 0) return [];

  let prevSize = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const sizeDiff = Math.abs(frame.dataLength - prevSize);
    const relativeChange = prevSize > 0 ? sizeDiff / prevSize : frame.dataLength > 0 ? 1 : 0;

    if (relativeChange >= VISUAL_CHANGE_THRESHOLD || (i === 0 && frame.dataLength > 0)) {
      changes.push({
        timestamp: frame.timestamp,
        frameIndex: i,
        visualCompleteness: Math.min(100, Math.round((frame.dataLength / finalSize) * 100)),
        changeMagnitude: Math.min(1, relativeChange),
      });
    }

    prevSize = frame.dataLength;
  }

  return changes;
}

/**
 * Build frame summaries from captured screencast frames, annotating each
 * with whether it represents a significant visual change.
 */
export function buildFilmstrip(
  frames: ScreencastFrame[],
  visualChanges: VisualChangePoint[],
): FrameSummary[] {
  const changeIndices = new Set(visualChanges.map((vc) => vc.frameIndex));

  return frames.map((frame, i) => ({
    index: i,
    timestamp: Math.round(frame.timestamp),
    dataLength: frame.dataLength,
    isVisualChange: changeIndices.has(i),
  }));
}

/**
 * Approximate Speed Index from visual change points.
 *
 * Speed Index measures how quickly the visible area of the page is populated.
 * Lower is better. Calculated as the area above the visual progress curve.
 *
 * @see https://developer.chrome.com/docs/lighthouse/performance/speed-index
 */
export function approximateSpeedIndex(visualChanges: VisualChangePoint[]): number {
  if (visualChanges.length === 0) return 0;

  const sorted = [...visualChanges].sort((a, b) => a.timestamp - b.timestamp);
  const lastChange = sorted[sorted.length - 1]!;
  const totalTime = lastChange.timestamp;
  if (totalTime <= 0) return 0;

  let speedIndex = 0;
  let prevTimestamp = 0;
  let prevCompleteness = 0;

  for (const change of sorted) {
    const duration = change.timestamp - prevTimestamp;
    speedIndex += duration * (1 - prevCompleteness / 100);
    prevTimestamp = change.timestamp;
    prevCompleteness = change.visualCompleteness;
  }

  // Add remaining area after last change to the end of observation
  if (prevCompleteness < 100) {
    speedIndex += (totalTime - prevTimestamp) * (1 - prevCompleteness / 100);
  }

  return Math.round(speedIndex);
}
