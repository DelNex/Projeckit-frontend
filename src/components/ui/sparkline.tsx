import React from 'react';
interface SparklineProps {
  values: Array<number | null>;
  ariaLabel: string;
  width?: number;
  height?: number;
}

/** A compact, dependency-free trend line for summary cards. */
export function Sparkline({ values, ariaLabel, width = 112, height = 32 }: SparklineProps) {
  const validValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (validValues.length === 0) {
    return <span className="text-[10px] text-gray-400">No trend data</span>;
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = Math.max(max - min, 1);
  const padding = 3;
  const points = validValues.map((value, index) => ({
    x: validValues.length === 1 ? width / 2 : padding + (index / (validValues.length - 1)) * (width - padding * 2),
    y: height - padding - ((value - min) / range) * (height - padding * 2),
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      className="shrink-0 overflow-visible"
    >
      {points.length > 1 ? (
        <path d={path} fill="none" stroke="var(--pk-brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill="var(--pk-brand)" />
    </svg>
  );
}
