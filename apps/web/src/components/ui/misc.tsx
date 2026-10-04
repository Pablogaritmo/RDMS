import { cn, initials } from '@/lib/utils';
import type { UserSummary } from '@rdms/shared';
import * as React from 'react';

export function Progress({ value, className, tone = 'auto', size = 'md' }: { value: number; className?: string; tone?: 'auto' | 'primary' | 'success' | 'warning' | 'danger' | 'muted'; size?: 'sm' | 'md' }) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    tone === 'auto'
      ? v >= 100
        ? 'bg-emerald-500'
        : 'bg-primary'
      : tone === 'primary'
        ? 'bg-primary'
        : tone === 'success'
          ? 'bg-emerald-500'
          : tone === 'warning'
            ? 'bg-amber-500'
            : tone === 'danger'
              ? 'bg-red-500'
              : 'bg-muted-foreground/40';
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-300', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

const avatarColors = ['bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-violet-100 text-violet-800', 'bg-teal-100 text-teal-800', 'bg-orange-100 text-orange-800', 'bg-indigo-100 text-indigo-800'];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}

export function Avatar({ user, size = 'md', className }: { user: Pick<UserSummary, 'id' | 'name' | 'avatarUrl'> | null | undefined; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const dim = size === 'xs' ? 'size-5 text-[9px]' : size === 'sm' ? 'size-6 text-[10px]' : size === 'md' ? 'size-7 text-[11px]' : 'size-10 text-sm';
  if (!user) {
    return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground', dim, className)}>?</span>;
  }
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name} className={cn('inline-block shrink-0 rounded-full object-cover', dim, className)} />;
  }
  return (
    <span className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', dim, colorFor(user.id), className)} title={user.name}>
      {initials(user.name)}
    </span>
  );
}

export function UserChip({ user, size = 'sm', className, muted }: { user: UserSummary | null | undefined; size?: 'xs' | 'sm' | 'md'; className?: string; muted?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Avatar user={user} size={size} />
      <span className={cn('truncate', muted && 'text-muted-foreground', !user && 'text-muted-foreground italic', user && !user.isActive && 'line-through text-muted-foreground')}>
        {user ? user.name : 'Sin asignar'}
      </span>
    </span>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return <div role="separator" className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center', className)}>
      {Icon ? <Icon className="size-8 text-muted-foreground/60" /> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, className, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight tracking-tight">{title}</h1>
          {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone, className, onClick }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'danger' | 'warning' | 'success' | 'info'; className?: string; onClick?: () => void }) {
  const toneClass = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : tone === 'info' ? 'text-sky-600' : '';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn('flex flex-col gap-0.5 rounded-lg border bg-card px-3.5 py-3 text-left shadow-xs', onClick && 'cursor-pointer transition-colors hover:bg-accent/60', className)}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('text-xl font-semibold leading-tight tabular', toneClass)}>{value}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </Comp>
  );
}
