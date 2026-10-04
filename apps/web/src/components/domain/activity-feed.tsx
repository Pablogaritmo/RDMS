import { Avatar, EmptyState } from '@/components/ui/misc';
import { useProjectOptional } from '@/hooks/use-project';
import { formatDate, formatDateTime, formatMoney, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  COMPONENT_FIELD_LABELS,
  MANUFACTURING_PROCESSES,
  MATERIAL_STATUSES,
  PRIORITY_BY_KEY,
  STATUS_BY_KEY,
  type ActivityChange,
  type ActivityLog,
  type ComponentStatus,
  type Priority,
} from '@rdms/shared';
import { Activity } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';

const MONEY_FIELDS = new Set(['estMaterialCost', 'estManufacturingCost', 'estPurchaseCost', 'estOtherCost', 'actualCost', 'budget']);
const DATE_FIELDS = new Set(['startDate', 'dueDate', 'scheduledDate', 'actualDate', 'targetDate', 'date']);
const MINUTE_FIELDS = new Set(['setupMinutes', 'machineMinutes', 'finishingMinutes', 'inspectionMinutes']);

function renderValue(field: string, value: unknown, label: string | null | undefined, currency: string): string {
  if (label) return label;
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status') return STATUS_BY_KEY[value as ComponentStatus]?.label ?? String(value);
  if (field === 'priority') return PRIORITY_BY_KEY[value as Priority]?.label ?? String(value);
  if (field === 'materialStatus') return MATERIAL_STATUSES.find((m) => m.key === value)?.label ?? String(value);
  if (field === 'process') return MANUFACTURING_PROCESSES.find((m) => m.key === value)?.label ?? String(value);
  if (MONEY_FIELDS.has(field) && typeof value === 'number') return formatMoney(value, currency);
  if (DATE_FIELDS.has(field) && typeof value === 'string') return formatDate(value);
  if (MINUTE_FIELDS.has(field)) return `${value} min`;
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  const s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

const fieldLabel = (field: string) => COMPONENT_FIELD_LABELS[field] ?? field;

function describe(log: ActivityLog, currency: string): React.ReactNode {
  const changes = log.changes ?? [];
  const statusChange = changes.find((c) => c.field === 'status');
  switch (log.action) {
    case 'created':
      return (
        <>
          creó <b>{log.entityLabel}</b>
          {statusChange ? <> en estado <b>{renderValue('status', statusChange.to, null, currency)}</b></> : null}
        </>
      );
    case 'deleted':
      return (
        <>
          eliminó <b>{log.entityLabel}</b>
        </>
      );
    case 'status_changed':
      return (
        <>
          cambió <b>{log.entityLabel}</b> de <b>{renderValue('status', statusChange?.from, null, currency)}</b> a <b>{renderValue('status', statusChange?.to, null, currency)}</b>
        </>
      );
    case 'dependency_added': {
      const ch = changes[0];
      return (
        <>
          indicó que <b>{log.entityLabel}</b> depende de <b>{ch?.toLabel ?? 'otro componente'}</b>
        </>
      );
    }
    case 'dependency_removed': {
      const ch = changes[0];
      return (
        <>
          quitó la dependencia de <b>{log.entityLabel}</b> hacia <b>{ch?.fromLabel ?? 'otro componente'}</b>
        </>
      );
    }
    case 'collaborator_added':
      return (
        <>
          agregó a <b>{changes[0]?.toLabel ?? 'alguien'}</b> como colaborador de <b>{log.entityLabel}</b>
        </>
      );
    case 'collaborator_removed':
      return (
        <>
          quitó a <b>{changes[0]?.fromLabel ?? 'alguien'}</b> de <b>{log.entityLabel}</b>
        </>
      );
    case 'member_added':
      return (
        <>
          agregó a <b>{changes[0]?.toLabel ?? 'alguien'}</b> al proyecto{log.note ? ` como ${log.note}` : ''}
        </>
      );
    case 'member_removed':
      return (
        <>
          quitó a <b>{changes[0]?.fromLabel ?? 'alguien'}</b> del proyecto
        </>
      );
    case 'updated': {
      const assign = changes.find((c) => c.field === 'responsibleId');
      if (assign && changes.length === 1) {
        return (
          <>
            asignó <b>{log.entityLabel}</b> a <b>{assign.toLabel ?? 'nadie'}</b>
          </>
        );
      }
      if (changes.length === 1) {
        const ch = changes[0] as ActivityChange;
        return (
          <>
            modificó {fieldLabel(ch.field)} de <b>{log.entityLabel}</b>: <s className="text-muted-foreground">{renderValue(ch.field, ch.from, ch.fromLabel, currency)}</s> → <b>{renderValue(ch.field, ch.to, ch.toLabel, currency)}</b>
          </>
        );
      }
      return (
        <>
          actualizó <b>{log.entityLabel}</b> ({changes.map((c) => fieldLabel(c.field)).join(', ')}
          {log.note === 'manufactura' ? ' · manufactura' : ''})
        </>
      );
    }
    default:
      return <>{log.action}</>;
  }
}

export function ActivityFeed({ logs, compact, showEntityLinks = true, className }: { logs: ActivityLog[]; compact?: boolean; showEntityLinks?: boolean; className?: string }) {
  const project = useProjectOptional();
  const currency = project?.project.currency ?? 'CRC';
  if (logs.length === 0) return <EmptyState icon={Activity} title="Sin actividad todavía" description="Los cambios que haga el equipo aparecerán aquí automáticamente." />;

  return (
    <ol className={cn('relative flex flex-col', className)}>
      {logs.map((log, i) => {
        const user = log.userId ? (project?.usersById.get(log.userId) ?? { id: log.userId, name: log.userName ?? 'Usuario', avatarUrl: null }) : null;
        const entityHref = showEntityLinks && project && log.entityType === 'component' && log.action !== 'deleted' ? `/p/${project.project.id}/components/${log.entityId}` : null;
        const content = (
          <span className="text-[13px] leading-snug">
            <span className="font-medium">{log.userName ?? 'Sistema'}</span> {describe(log, currency)}
          </span>
        );
        return (
          <li key={log.id} className={cn('relative flex gap-3', compact ? 'py-1.5' : 'py-2.5', i !== logs.length - 1 && 'border-b border-dashed')}>
            <Avatar user={user} size={compact ? 'xs' : 'sm'} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              {entityHref ? (
                <Link to={entityHref} className="hover:underline">
                  {content}
                </Link>
              ) : (
                content
              )}
              {log.note && log.note !== 'manufactura' && !['member_added'].includes(log.action) ? <p className="mt-0.5 rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground italic">“{log.note}”</p> : null}
              {!compact && log.action === 'updated' && (log.changes?.length ?? 0) > 1 ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {log.changes!.map((ch) => (
                    <li key={ch.field}>
                      {fieldLabel(ch.field)}: <s>{renderValue(ch.field, ch.from, ch.fromLabel, currency)}</s> → <span className="text-foreground">{renderValue(ch.field, ch.to, ch.toLabel, currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <time className="mt-0.5 block text-[11px] text-muted-foreground" title={formatDateTime(log.createdAt)} dateTime={log.createdAt}>
                {timeAgo(log.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
