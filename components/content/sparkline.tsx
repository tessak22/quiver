/**
 * Sparkline — components/content/sparkline.tsx
 *
 * Pure SVG sparkline chart for displaying metric trends inline.
 * No charting library dependencies.
 */

interface SparklineProps {
  data: number[];
  width: number;
  height: number;
  color: string;
}

export function Sparkline({ data, width, height, color }: SparklineProps) {
  if (data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  // Build polyline points
  const points = data.map((value, index) => {
    const x =
      data.length === 1
        ? width / 2
        : (index / (data.length - 1)) * width;
    const y =
      range === 0
        ? height / 2
        : height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Last point coordinates for the filled circle
  const lastX =
    data.length === 1
      ? width / 2
      : width;
  const lastY =
    range === 0
      ? height / 2
      : height - ((data[data.length - 1] - min) / range) * height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX.toFixed(1)}
        cy={lastY.toFixed(1)}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}
