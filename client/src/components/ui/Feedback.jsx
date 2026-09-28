import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200', className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mb-4 rounded-full bg-slate-100 p-3">
        <Icon className="h-6 w-6 text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-7 w-7 text-red-500" />
      <h3 className="font-semibold text-red-900">{title}</h3>
      <p className="mt-1 text-sm text-red-700">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const tones = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
};

export function Badge({ tone = 'gray', className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-transparent', tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS = {
  CONFIRMED: ['green', 'Confirmed'],
  PENDING: ['amber', 'Awaiting payment'],
  PAYMENT_PROCESSING: ['blue', 'Processing payment'],
  EXPIRED: ['gray', 'Expired'],
  RELEASED: ['gray', 'Released'],
  FAILED: ['red', 'Failed'],
  CANCELLED: ['red', 'Cancelled'],
  CAPTURED: ['green', 'Paid'],
  CREATED: ['gray', 'Created'],
  REFUND_PENDING: ['amber', 'Refund pending'],
  REFUNDED: ['violet', 'Refunded'],
  ACTIVE: ['green', 'Active'],
  USED: ['blue', 'Used'],
  DRAFT: ['gray', 'Draft'],
  PUBLISHED: ['green', 'Published'],
  UNPUBLISHED: ['amber', 'Unpublished'],
  SUSPENDED: ['red', 'Suspended'],
  APPROVED: ['green', 'Approved'],
  REJECTED: ['red', 'Rejected'],
};

export function StatusBadge({ status }) {
  const [tone, label] = STATUS[status] || ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

const SALE = {
  AVAILABLE: ['green', 'Available'],
  FILLING_FAST: ['amber', 'Filling fast'],
  SOLD_OUT: ['red', 'Sold out'],
  NOT_STARTED: ['blue', 'Sales open soon'],
  SALES_CLOSED: ['gray', 'Sales closed'],
  CANCELLED: ['red', 'Cancelled'],
  ENDED: ['gray', 'Event ended'],
  UNAVAILABLE: ['gray', 'Unavailable'],
};

export function SaleBadge({ status }) {
  const [tone, label] = SALE[status] || ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}
