import { cn } from '@/lib/utils';
import * as React from 'react';

const fieldClass =
  'flex w-full min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldClass, 'h-9', type === 'number' && 'tabular', className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'min-h-16 resize-y py-2', className)} {...props} />;
}

function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        fieldClass,
        'h-9 appearance-none bg-no-repeat pr-8 cursor-pointer',
        "bg-[url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")] bg-[length:1.25rem] bg-[position:right_0.5rem_center]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-xs font-medium text-muted-foreground leading-none select-none', className)} {...props} />;
}

function Checkbox({ className, ...props }: React.ComponentProps<'input'>) {
  return <input type="checkbox" className={cn('size-4 rounded border-input accent-primary cursor-pointer', className)} {...props} />;
}

/** Label + control wrapper for compact forms. */
function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export { Checkbox, Field, Input, Label, NativeSelect, Textarea, fieldClass };
