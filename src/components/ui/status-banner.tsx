import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { OmrBubble, type OmrBubbleTone } from '@/components/ui/OmrBubble';

export type StatusBannerTone = 'info' | 'success' | 'warning' | 'danger';

interface StatusBannerProps {
  tone?: StatusBannerTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const toneMap: Record<StatusBannerTone, { bubble: OmrBubbleTone; Icon: typeof Info }> = {
  info: { bubble: 'muted', Icon: Info },
  success: { bubble: 'success', Icon: CheckCircle2 },
  warning: { bubble: 'warning', Icon: AlertTriangle },
  danger: { bubble: 'danger', Icon: AlertCircle },
};

/** Compact, neutral status message shared by forms and administrative screens. */
export function StatusBanner({
  tone = 'info',
  children,
  action,
  className = '',
}: StatusBannerProps) {
  const { bubble, Icon } = toneMap[tone];
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={`flex min-w-0 items-start gap-3 border-y border-[var(--pk-line)] py-3 text-sm text-[var(--pk-ink)] ${className}`}
    >
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-2">
        <OmrBubble tone={bubble} selected size={8} />
        <Icon aria-hidden="true" className="h-4 w-4 text-[var(--pk-muted)]" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
