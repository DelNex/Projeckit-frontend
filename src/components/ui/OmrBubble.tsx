import { cn } from '@/lib/utils';

export type OmrBubbleTone = 'brand' | 'success' | 'warning' | 'danger' | 'muted';

interface OmrBubbleProps {
  selected?: boolean;
  tone?: OmrBubbleTone;
  size?: 8 | 10;
  className?: string;
  label?: string;
}

/** Small, consistent OMR-style marker for selection and semantic status. */
export function OmrBubble({
  selected = false,
  tone = 'muted',
  size = 8,
  className,
  label,
}: OmrBubbleProps) {
  const toneClass = {
    brand: 'text-[var(--pk-brand)] border-[var(--pk-brand)]',
    success: 'text-[var(--pk-success)] border-[var(--pk-success)]',
    warning: 'text-[var(--pk-warning)] border-[var(--pk-warning)]',
    danger: 'text-[var(--pk-danger)] border-[var(--pk-danger)]',
    muted: 'text-[var(--pk-muted)] border-current',
  }[tone];

  return (
    <span
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      data-omr-bubble="true"
      className={cn(
        'inline-block shrink-0 rounded-full border-[1.5px]',
        toneClass,
        selected ? 'bg-current' : 'bg-transparent',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
