import React from 'react';
import type { CSSProperties } from 'react';

export interface BarListItem {
  key: string;
  label: string;
  detail?: string;
  value: number;
  percentage: number;
  color: string;
}

interface BarListProps {
  items: BarListItem[];
  ariaLabel: string;
  valueLabel?: string;
}

/**
 * Compact, responsive horizontal bars with readable values.
 * The visible labels remain available even when a bar is too small to see.
 */
export function BarList({ items, ariaLabel, valueLabel = 'learners' }: BarListProps) {
  return (
    <ul aria-label={ariaLabel} className="space-y-3">
      {items.map((item) => {
        const percentage = Math.min(100, Math.max(0, item.percentage));
        return (
          <li key={item.key} className="space-y-1.5">
            <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{item.label}</span>
                {item.detail ? <span className="ml-2 text-[10px] text-gray-500 dark:text-gray-400">{item.detail}</span> : null}
              </div>
              <span className="shrink-0 font-mono tabular-nums text-gray-700 dark:text-gray-300">
                {item.value.toLocaleString()} {valueLabel} · {percentage.toFixed(1)}%
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
              role="progressbar"
              aria-label={item.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percentage)}
              aria-valuetext={`${item.value} ${valueLabel}, ${percentage.toFixed(1)} percent`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${percentage}%`, backgroundColor: item.color } as CSSProperties}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
