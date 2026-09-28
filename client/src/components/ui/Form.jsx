import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const base =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100';

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cn(base, 'h-10', invalid && 'border-red-400', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, 'py-2.5', invalid && 'border-red-400', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(base, 'h-10 pr-8', invalid && 'border-red-400', className)} {...props}>
      {children}
    </select>
  );
});

export function Field({ label, error, hint, children, className }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
