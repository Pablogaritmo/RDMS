import { BlockedBadge, PriorityIcon } from '@/components/domain/badges';
import { StatusChanger } from '@/components/domain/status-changer';
import { EmptyState, UserChip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/hooks/use-project';
import { dueLabel, formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { estimatedCost, PRIORITY_BY_KEY, statusOrder, type Component } from '@rdms/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, Box, GitFork } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';

export type SortKey = 'code' | 'name' | 'system' | 'responsible' | 'status' | 'priority' | 'dueDate' | 'cost' | 'blocking';

interface Props {
  components: Component[];
  hideSystem?: boolean;
  dense?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  defaultSort?: { key: SortKey; dir: 'asc' | 'desc' };
}

export function ComponentTable({ components, hideSystem, dense, emptyTitle = 'Sin componentes', emptyDescription, emptyAction, defaultSort }: Props) {
  const { project, systemsById, usersById, blocking, isOverdue, isDueSoon, today } = useProject();
  const navigate = useNavigate();
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>(defaultSort ?? { key: 'code', dir: 'asc' });

  const sorted = React.useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (c: Component): string | number => {
      switch (sort.key) {
        case 'code':
          return c.code;
        case 'name':
          return c.name.toLowerCase();
        case 'system':
          return systemsById.get(c.systemId)?.code ?? '';
        case 'responsible':
          return (c.responsibleId && usersById.get(c.responsibleId)?.name) || '\uffff';
        case 'status':
          return statusOrder(c.status);
        case 'priority':
          return PRIORITY_BY_KEY[c.priority].order;
        case 'dueDate':
          return c.dueDate ?? '9999';
        case 'cost':
          return estimatedCost(c);
        case 'blocking':
          return blocking.get(c.id)?.blocking.length ?? 0;
      }
    };
    return [...components].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.code.localeCompare(b.code);
    });
  }, [components, sort, systemsById, usersById, blocking]);

  // numeric "more is more interesting" columns start descending
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'blocking' || key === 'cost' ? 'desc' : 'asc' }));

  if (components.length === 0) {
    return <EmptyState icon={Box} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="@container rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead sort={sort} onToggle={toggle} k="code" className="w-[88px]">
              Código
            </SortableHead>
            <SortableHead sort={sort} onToggle={toggle} k="name">Componente</SortableHead>
            {!hideSystem ? (
              <SortableHead sort={sort} onToggle={toggle} k="system" className="hidden @4xl:table-cell">
                Sistema
              </SortableHead>
            ) : null}
            <SortableHead sort={sort} onToggle={toggle} k="responsible" className="hidden @xl:table-cell">
              Responsable
            </SortableHead>
            <SortableHead sort={sort} onToggle={toggle} k="status">Estado</SortableHead>
            <SortableHead sort={sort} onToggle={toggle} k="priority" className="w-[60px] text-center">
              Prio.
            </SortableHead>
            <SortableHead sort={sort} onToggle={toggle} k="blocking" className="hidden @2xl:table-cell w-[84px] text-center" title="Cuántos componentes están bloqueados por este">
              Bloquea
            </SortableHead>
            <SortableHead sort={sort} onToggle={toggle} k="dueDate" className="hidden @3xl:table-cell">
              Fecha límite
            </SortableHead>
            <SortableHead sort={sort} onToggle={toggle} k="cost" className="hidden @5xl:table-cell text-right">
              Costo est.
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => {
            const overdue = isOverdue(c);
            const soon = !overdue && isDueSoon(c);
            const block = blocking.get(c.id);
            const blocked = (block?.blockedBy.length ?? 0) > 0;
            const blocksOthers = block?.blocking.length ?? 0;
            const system = systemsById.get(c.systemId);
            const responsible = c.responsibleId ? usersById.get(c.responsibleId) : null;
            return (
              <TableRow
                key={c.id}
                onClick={() => navigate(`/p/${project.id}/components/${c.id}`)}
                className={cn('cursor-pointer', dense && '[&>td]:py-1.5', c.priority === 'critical' && !['completed', 'integrated'].includes(c.status) && 'border-l-2 border-l-red-500')}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">{c.code}</TableCell>
                <TableCell>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{c.name}</span>
                    {blocked || blocksOthers > 0 || c.quantity > 1 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {blocked ? <BlockedBadge /> : null}
                        {blocksOthers > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-red-600 @2xl:hidden" title={`Bloquea ${blocksOthers} componente(s)`}>
                            <GitFork className="size-3" /> bloquea {blocksOthers}
                          </span>
                        ) : null}
                        {c.quantity > 1 ? <span className="text-[11px] text-muted-foreground">×{c.quantity}</span> : null}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                {!hideSystem ? (
                  <TableCell className="hidden @4xl:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="font-mono text-muted-foreground">{system?.code}</span>
                      <span className="truncate text-muted-foreground">{system?.name}</span>
                    </span>
                  </TableCell>
                ) : null}
                <TableCell className="hidden @xl:table-cell">
                  <UserChip user={responsible} size="xs" className="text-xs max-w-[160px]" />
                </TableCell>
                <TableCell>
                  <StatusChanger component={c} size="xs" />
                </TableCell>
                <TableCell className="text-center">
                  <PriorityIcon priority={c.priority} />
                </TableCell>
                <TableCell className="hidden @2xl:table-cell text-center">
                  {blocksOthers > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 tabular" title={`Bloquea ${blocksOthers} componente(s)`}>
                      <GitFork className="size-3" /> {blocksOthers}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden @3xl:table-cell">
                  {c.dueDate ? (
                    <span className={cn('flex flex-col text-xs tabular', overdue && 'text-red-600 font-medium', soon && 'text-amber-600 font-medium')}>
                      {formatDate(c.dueDate)}
                      {(overdue || soon) && !['completed', 'integrated'].includes(c.status) ? <span className="text-[10px] font-normal">{dueLabel(c.dueDate, today)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden @5xl:table-cell text-right text-xs tabular text-muted-foreground">{formatMoney(estimatedCost(c), project.currency)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableHead({ k, sort, onToggle, children, className, title }: { k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onToggle: (k: SortKey) => void; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onToggle(k)} title={title} className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer">
        {children}
        {sort.key === k ? sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-30" />}
      </button>
    </TableHead>
  );
}
