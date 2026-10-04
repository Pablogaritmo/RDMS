import { STATUS_DOT } from '@/components/domain/badges';
import { ComponentFormDialog } from '@/components/domain/component-form';
import { ComponentTable } from '@/components/domain/component-table';
import { UserPicker } from '@/components/domain/pickers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, EmptyState, Progress, Stat } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { formatHours, formatMoney, pct } from '@/lib/format';
import { useSystemMemberMutation } from '@/lib/queries';
import { SystemEditDialog } from '@/components/domain/system-form';
import { cn } from '@/lib/utils';
import { COMPONENT_STATUSES, estimatedCost, purchasesForComponents, summarizeComponents } from '@rdms/shared';
import { ArrowLeft, Layers, Pencil, Plus, X } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

export function SystemDetailPage() {
  const { systemId = '' } = useParams();
  const data = useProject();
  const { project, systemsById, components, blocking, today, usersById, members, canManageSystem, canManageProject, canCreateIn, purchases } = data;
  const system = systemsById.get(systemId);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const memberMutation = useSystemMemberMutation(project.id);

  if (!system) {
    return (
      <EmptyState
        icon={Layers}
        title="Sistema no encontrado"
        action={
          <Button variant="outline" asChild>
            <Link to={`/p/${project.id}/systems`}>Volver a sistemas</Link>
          </Button>
        }
      />
    );
  }

  const comps = components.filter((c) => c.systemId === system.id);
  const sum = summarizeComponents(comps, blocking, today, purchasesForComponents(new Set(comps.map((c) => c.id)), purchases), false);
  const est = comps.reduce((acc, c) => acc + estimatedCost(c), 0);
  const manage = canManageSystem(system.id);
  const lead = system.members.find((m) => m.role === 'lead');
  const base = `/p/${project.id}/components?system=${system.id}`;
  const statusCounts = COMPONENT_STATUSES.map((s) => ({ ...s, n: comps.filter((c) => c.status === s.key).length })).filter((s) => s.n > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to={`/p/${project.id}/systems`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Sistemas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{system.code}</span>
              <h1 className="text-xl font-semibold tracking-tight">{system.name}</h1>
            </div>
            {system.description ? <p className="mt-0.5 text-sm text-muted-foreground">{system.description}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {manage ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Editar sistema
              </Button>
            ) : null}
            {canCreateIn(system.id) ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Nuevo componente
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={sum.percent} className="flex-1" />
          <span className="text-sm font-semibold tabular">{pct(sum.percent)}</span>
          <span className="text-xs text-muted-foreground tabular">
            {sum.completed}/{sum.total} completados
          </span>
        </div>
        {statusCounts.length ? (
          <div className="flex h-2 w-full overflow-hidden rounded-full" title="Distribución por estado">
            {statusCounts.map((s) => (
              <div key={s.key} className={cn(STATUS_DOT[s.key])} style={{ width: `${(s.n / comps.length) * 100}%` }} title={`${s.label}: ${s.n}`} />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {statusCounts.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className={cn('size-2 rounded-full', STATUS_DOT[s.key])} /> {s.label} {s.n}
            </span>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Componentes" value={sum.total} hint={`${sum.completed} completados`} />
        <Stat label="Atrasados" value={sum.overdue} tone={sum.overdue ? 'danger' : 'default'} />
        <Stat label="Bloqueados" value={sum.blocked} tone={sum.blocked ? 'danger' : 'default'} />
        <Stat label="Horas de taller" value={formatHours(sum.workshopHours)} hint={`${formatHours(sum.pendingWorkshopHours)} pendientes`} />
        <Stat label="Costo estimado" value={formatMoney(est, project.currency, { compact: true })} tone={system.budget && est > system.budget ? 'danger' : 'default'} hint={system.budget ? `presupuesto ${formatMoney(system.budget, project.currency, { compact: true })}` : 'sin presupuesto'} />
        <Stat label="Gastado" value={formatMoney(sum.costs.actual, project.currency, { compact: true })} hint={system.budget ? `${pct((sum.costs.actual / system.budget) * 100)} del presupuesto` : undefined} />
      </section>

      <div className="grid gap-5 lg:grid-cols-4">
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Componentes</h2>
            <Link to={base} className="text-xs text-muted-foreground hover:text-foreground">
              Abrir con filtros →
            </Link>
          </div>
          <ComponentTable
            components={comps}
            hideSystem
            emptyTitle="Este sistema no tiene componentes"
            emptyAction={
              canCreateIn(system.id) ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> Nuevo componente
                </Button>
              ) : undefined
            }
          />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Equipo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {system.members.length === 0 ? <p className="text-xs text-muted-foreground">Sin miembros asignados.</p> : null}
            {system.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <Avatar user={usersById.get(m.id) ?? m} size="sm" />
                <span className={cn('min-w-0 flex-1 truncate', !m.isActive && 'line-through text-muted-foreground')}>{m.name}</span>
                {m.role === 'lead' ? <Badge variant="info">Líder</Badge> : null}
                {manage && m.role !== 'lead' ? (
                  <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" aria-label="Quitar del sistema" onClick={() => memberMutation.mutate({ systemId: system.id, userId: m.id, remove: true }, { onError: (e) => toast.error(e.message) })}>
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
            {manage ? (
              <AddMember
                exclude={new Set(system.members.map((m) => m.id))}
                users={members}
                onPick={(id) => memberMutation.mutate({ systemId: system.id, userId: id, role: 'member' }, { onError: (e) => toast.error(e.message) })}
              />
            ) : null}
            {!lead ? <p className="text-[11px] text-muted-foreground">Este sistema no tiene líder. {canManageProject ? 'Asígnalo en «Editar sistema».' : ''}</p> : null}
          </CardContent>
        </Card>
      </div>

      <ComponentFormDialog open={createOpen} onOpenChange={setCreateOpen} defaultSystemId={system.id} />
      <SystemEditDialog open={editOpen} onOpenChange={setEditOpen} system={system} />
    </div>
  );
}

function AddMember({ users, exclude, onPick }: { users: { id: string; name: string; email: string; avatarUrl: string | null; isActive: boolean }[]; exclude: Set<string>; onPick: (id: string) => void }) {
  const [value, setValue] = React.useState<string | null>(null);
  return (
    <UserPicker
      users={users.filter((u) => !exclude.has(u.id))}
      value={value}
      onChange={(id) => {
        if (id) {
          onPick(id);
          setValue(null);
        }
      }}
      allowClear={false}
      size="sm"
      placeholder="Agregar miembro"
      className="mt-1 w-full"
    />
  );
}
