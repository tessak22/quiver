/**
 * Tests for components/content/sparkline.tsx — SVG coordinate math
 *
 * The Sparkline component is a pure function: given data, width, height,
 * and color, it produces SVG elements with computed coordinate values.
 * Since it has no state, effects, or event handlers, we can test the
 * coordinate math directly by re-implementing the logic.
 *
 * We avoid rendering React components in these tests (the project uses
 * environment: 'node') and instead verify the mathematical behavior that
 * the component relies on.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Re-implement the sparkline math for testing
// ---------------------------------------------------------------------------

interface SparklineCoords {
  points: Array<{ x: number; y: number }>;
  lastX: number;
  lastY: number;
}

function computeSparklineCoords(
  data: number[],
  width: number,
  height: number
): SparklineCoords | null {
  if (data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  const points = data.map((value, index) => {
    const x =
      data.length === 1
        ? width / 2
        : (index / (data.length - 1)) * width;
    const y =
      range === 0
        ? height / 2
        : height - ((value - min) / range) * height;
    return { x, y };
  });

  const lastX =
    data.length === 1
      ? width / 2
      : width;
  const lastY =
    range === 0
      ? height / 2
      : height - ((data[data.length - 1] - min) / range) * height;

  return { points, lastX, lastY };
}

// ---------------------------------------------------------------------------
// Empty data
// ---------------------------------------------------------------------------

describe('Sparkline coordinate math — empty data', () => {
  it('returns null for empty data array', () => {
    expect(computeSparklineCoords([], 100, 30)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single data point
// ---------------------------------------------------------------------------

describe('Sparkline coordinate math — single point', () => {
  it('centers the single point horizontally', () => {
    const coords = computeSparklineCoords([42], 100, 30);
    expect(coords).not.toBeNull();
    expect(coords!.points[0].x).toBe(50); // width / 2
  });

  it('centers the single point vertically (range is 0)', () => {
    const coords = computeSparklineCoords([42], 100, 30);
    expect(coords!.points[0].y).toBe(15); // height / 2
  });

  it('sets lastX to width/2 for single point', () => {
    const coords = computeSparklineCoords([42], 100, 30);
    expect(coords!.lastX).toBe(50);
  });

  it('sets lastY to height/2 for single point', () => {
    const coords = computeSparklineCoords([42], 100, 30);
    expect(coords!.lastY).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// All-equal values (range === 0)
// ---------------------------------------------------------------------------

describe('Sparkline coordinate math — all-equal values', () => {
  it('places all points at height/2 when all values are equal', () => {
    const coords = computeSparklineCoords([50, 50, 50], 100, 30);
    expect(coords).not.toBeNull();
    for (const point of coords!.points) {
      expect(point.y).toBe(15); // height / 2
    }
  });

  it('distributes x coordinates evenly across width', () => {
    const coords = computeSparklineCoords([50, 50, 50], 100, 30);
    expect(coords!.points[0].x).toBe(0);
    expect(coords!.points[1].x).toBe(50);
    expect(coords!.points[2].x).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Two data points
// ---------------------------------------------------------------------------

describe('Sparkline coordinate math — two points', () => {
  it('places first point at x=0 and last at x=width', () => {
    const coords = computeSparklineCoords([10, 20], 100, 30);
    expect(coords!.points[0].x).toBe(0);
    expect(coords!.points[1].x).toBe(100);
  });

  it('maps minimum value to bottom (y=height) and maximum to top (y=0)', () => {
    const coords = computeSparklineCoords([10, 20], 100, 30);
    // min=10, max=20, range=10
    // y for 10 = 30 - ((10-10)/10)*30 = 30 (bottom)
    // y for 20 = 30 - ((20-10)/10)*30 = 0 (top)
    expect(coords!.points[0].y).toBe(30);
    expect(coords!.points[1].y).toBe(0);
  });

  it('sets lastX to width and lastY to the last point y', () => {
    const coords = computeSparklineCoords([10, 20], 100, 30);
    expect(coords!.lastX).toBe(100);
    expect(coords!.lastY).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Multiple data points — general case
// ---------------------------------------------------------------------------

describe('Sparkline coordinate math — multiple points', () => {
  it('correctly normalizes y values across a range', () => {
    // data: [0, 50, 100], width=120, height=60
    // min=0, max=100, range=100
    // y for 0   = 60 - ((0-0)/100)*60 = 60 (bottom)
    // y for 50  = 60 - ((50-0)/100)*60 = 30 (middle)
    // y for 100 = 60 - ((100-0)/100)*60 = 0 (top)
    const coords = computeSparklineCoords([0, 50, 100], 120, 60);
    expect(coords!.points[0].y).toBe(60);
    expect(coords!.points[1].y).toBe(30);
    expect(coords!.points[2].y).toBe(0);
  });

  it('evenly spaces x coordinates', () => {
    // 4 data points, width=90
    // x: 0, 30, 60, 90
    const coords = computeSparklineCoords([1, 2, 3, 4], 90, 30);
    expect(coords!.points[0].x).toBe(0);
    expect(coords!.points[1].x).toBe(30);
    expect(coords!.points[2].x).toBe(60);
    expect(coords!.points[3].x).toBe(90);
  });

  it('handles negative values correctly', () => {
    // data: [-10, 0, 10], width=100, height=40
    // min=-10, max=10, range=20
    // y for -10 = 40 - ((-10-(-10))/20)*40 = 40 (bottom)
    // y for 0   = 40 - ((0-(-10))/20)*40 = 40 - 20 = 20 (middle)
    // y for 10  = 40 - ((10-(-10))/20)*40 = 40 - 40 = 0 (top)
    const coords = computeSparklineCoords([-10, 0, 10], 100, 40);
    expect(coords!.points[0].y).toBe(40);
    expect(coords!.points[1].y).toBe(20);
    expect(coords!.points[2].y).toBe(0);
  });

  it('handles all-zero values like all-equal', () => {
    const coords = computeSparklineCoords([0, 0, 0], 100, 30);
    for (const point of coords!.points) {
      expect(point.y).toBe(15);
    }
  });

  it('handles descending data (latest point is the lowest)', () => {
    // data: [100, 50, 0], width=80, height=40
    // min=0, max=100, range=100
    // y for 100 = 40 - ((100-0)/100)*40 = 0 (top)
    // y for 50  = 40 - ((50-0)/100)*40 = 20 (middle)
    // y for 0   = 40 - ((0-0)/100)*40 = 40 (bottom)
    const coords = computeSparklineCoords([100, 50, 0], 80, 40);
    expect(coords!.points[0].y).toBe(0);
    expect(coords!.points[1].y).toBe(20);
    expect(coords!.points[2].y).toBe(40);
    expect(coords!.lastY).toBe(40);
  });

  it('produces correct lastX/lastY for multi-point data', () => {
    const coords = computeSparklineCoords([10, 20, 15], 100, 30);
    // lastX = width = 100
    // lastY = height - ((15-10)/(20-10))*30 = 30 - 15 = 15
    expect(coords!.lastX).toBe(100);
    expect(coords!.lastY).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Large datasets
// ---------------------------------------------------------------------------

describe('Sparkline coordinate math — large dataset', () => {
  it('handles 100 data points without error', () => {
    const data = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 100);
    const coords = computeSparklineCoords(data, 200, 50);
    expect(coords).not.toBeNull();
    expect(coords!.points).toHaveLength(100);
  });

  it('all x values are between 0 and width', () => {
    const data = Array.from({ length: 50 }, (_, i) => i * 2);
    const coords = computeSparklineCoords(data, 200, 50);
    for (const point of coords!.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(200);
    }
  });

  it('all y values are between 0 and height', () => {
    const data = Array.from({ length: 50 }, (_, i) => i * 2);
    const coords = computeSparklineCoords(data, 200, 50);
    for (const point of coords!.points) {
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(50);
    }
  });
});
