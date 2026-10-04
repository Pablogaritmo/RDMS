import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PRIORITY_BY_KEY, STATUS_BY_KEY, type ComponentStatus, type Priority, type ProjectStatus } from '@rdms/shared';
import { AlertTriangle, ArrowDown, ArrowUp, Ban, ChevronsUp, Clock, Minus } from 'lucide-react';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

export const STATUS_VARIANT: Record<ComponentStatus, BadgeVariant> = {
  idea: 'muted',
  design: 'info',
  design_approved: 'violet',
  pending_manufacturing: 'slate',
  in_manufacturing: 'orange',
  inspection: 'warning',
  completed: 'success',
  integrated: 'success',
};

/** Solid dot color for compact indicators (tables, charts). */
export const STATUS_DOT: Record<ComponentStatus, string> = {
  idea: 'bg-slate-300',
  design: 'bg-sky-500',
  design_approved: 'bg-violet-500',
  pending_manufacturing: 'bg-slate-500',
  in_manufacturing: 'bg-orange-500',
  inspection: 'bg-amber-500',
  completed: 'bg-emerald-500',
  integrated: 'bg-emerald-700',
};

export function StatusBadge({ status, className }: { status: ComponentStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {STATUS_BY_KEY[status].label}
    </Badge>
  );
}

export function BlockedBadge({ className, count }: { className?: string; count?: number }) {
  return (
    <Badge variant="danger" className={className} title="Depende de un componente que va atrasado respecto a este">
      <Ban />
      Bloqueado{count ? ` (${count})` : ''}
    </Badge>
  );
}

export function OverdueBadge({ label, className }: { label?: string; className?: string }) {
  return (
    <Badge variant="danger" className={className}>
      <AlertTriangle />
      {label ?? 'Atrasado'}
    </Badge>
  );
}

export function DueSoonBadge({ label, className }: { label?: string; className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      <Clock />
      {label ?? 'Próximo a vencer'}
    </Badge>
  );
}

const PRIORITY_ICON: Record<Priority, React.ComponentType<{ className?: string }>> = {
  critical: ChevronsUp,
  high: ArrowUp,
  medium: Minus,
  low: ArrowDown,
};
const PRIORITY_CLASS: Record<Priority, string> = {
  critical: 'text-red-600',
  high: 'text-orange-500',
  medium: 'text-slate-500',
  low: 'text-slate-400',
};

export function PriorityIcon({ priority, className, withLabel }: { priority: Priority; className?: string; withLabel?: boolean }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span className={cn('inline-flex items-center gap-1', PRIORITY_CLASS[priority], className)} title={`Prioridad ${PRIORITY_BY_KEY[priority].label.toLowerCase()}`}>
      <Icon className="size-3.5" />
      {withLabel ? <span className="text-xs">{PRIORITY_BY_KEY[priority].label}</span> : null}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const variant: BadgeVariant = priority === 'critical' ? 'danger' : priority === 'high' ? 'orange' : priority === 'medium' ? 'slate' : 'muted';
  const Icon = PRIORITY_ICON[priority];
  return (
    <Badge variant={variant}>
      <Icon />
      {PRIORITY_BY_KEY[priority].label}
    </Badge>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const map: Record<ProjectStatus, { label: string; variant: BadgeVariant }> = {
    planning: { label: 'Planificación', variant: 'info' },
    active: { label: 'Activo', variant: 'success' },
    completed: { label: 'Completado', variant: 'slate' },
    archived: { label: 'Archivado', variant: 'muted' },
  };
  return <Badge variant={map[status].variant}>{map[status].label}</Badge>;
}
