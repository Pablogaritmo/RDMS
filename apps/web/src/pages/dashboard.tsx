import { ActivityFeed } from '@/components/domain/activity-feed';
import { ProjectStatusBadge } from '@/components/domain/badges';
import { ComponentFormDialog } from '@/components/domain/component-form';
import { ComponentTable } from '@/components/domain/component-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, Stat, UserChip } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { buildAlerts, workOrder } from '@/lib/alerts';
import { formatDate, formatHours, formatMoney, pct } from '@/lib/format';
import { useActivity } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { daysBetween, estimatedCost, isDone, summarizeComponents } from '@rdms/shared';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Plus } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';

export function DashboardPage() {
  const data = useProject();
  const { project, components, systems, milestones, blocking, today, user, isMine, usersById, canCreateIn } = data;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = React.useState(false);
  const activity = useActivity(project.id, { limit: 8 });

  const summary = React.useMemo(() => summarizeComponents(components, blocking, today), [components, blocking, today]);
  const alerts = React.useMemo(() => buildAlerts(data), [data]);
  const mine = React.useMemo(() => components.filter((c) => isMine(c) && !isDone(c)).sort(workOrder(data)), [components, isMine, data]);
  const mineOverdue = mine.filter(data.isOverdue).length;
  const mineBlocked = mine.filter(data.isBlocked).length;
  const mineSoon = mine.filter(data.isDueSoon).length;

  const base = `/p/${project.id}/components`;
  const daysLeft = project.targetDate ? daysBetween(today, project.targetDate) : null;
  const nextMilestone = milestones.filter((m) => !m.completedAt && m.date >= today)[0];
  const budget = project.budget ?? 0;
  const spent = summary.costs.actual;
  const spentPct = budget ? (spent / budget) * 100 : 0;
  const estPct = budget ? (summary.costs.estimated / budget) * 100 : 0;
  const canCreateAnywhere = systems.some((s) => canCreateIn(s.id));
  const leads = data.members.filter((m) => m.role === 'lead');

  return (
    <div className="flex flex-col gap-6">
      {/* Project header */}
      <section className="rounded-xl border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{project.competition ?? project.description ?? '—'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Inicio <b className="text-foreground">{formatDate(project.startDate)}</b>
              </span>
              <span>
                Objetivo <b className="text-foreground">{formatDate(project.targetDate)}</b>
                {daysLeft !== null ? <span className={cn('ml-1', daysLeft < 0 && 'text-red-600')}>({daysLeft >= 0 ? `faltan ${daysLeft} días` : `hace ${-daysLeft} días`})</span> : null}
              </span>
              {nextMilestone ? (
                <Link to={`/p/${project.id}/schedule`} className="hover:underline">
                  Próximo hito: <b className="text-foreground">{nextMilestone.name}</b> · {formatDate(nextMilestone.date)}
                </Link>
              ) : null}
              {leads.length ? (
                <span className="inline-flex items-center gap-1">
                  Líder: <UserChip user={leads[0]} size="xs" className="text-foreground" />
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canCreateAnywhere ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Nuevo componente
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={summary.percent} className="flex-1" />
          <span className="text-sm font-semibold tabular">{pct(summary.percent)}</span>
          <span className="text-xs text-muted-foreground tabular">
            {summary.completed}/{summary.total} completados
          </span>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Componentes" value={summary.total} hint={`${summary.completed} completados`} onClick={() => navigate(base)} />
        <Stat label="Atrasados" value={summary.overdue} tone={summary.overdue ? 'danger' : 'default'} hint={summary.dueSoon ? `${summary.dueSoon} vencen pronto` : 'ninguno vence pronto'} onClick={() => navigate(`${base}?flag=overdue`)} />
        <Stat label="Bloqueados" value={summary.blocked} tone={summary.blocked ? 'danger' : 'default'} hint={summary.bottlenecks ? `${summary.bottlenecks} cuellos de botella` : 'sin cuellos de botella'} onClick={() => navigate(`${base}?flag=blocked`)} />
        <Stat label="En fabricación" value={summary.inManufacturing} tone="info" hint={`${summary.pendingManufacturing} pendientes de fabricar`} onClick={() => navigate(`${base}?status=in_manufacturing`)} />
        <Stat label="Pendientes de diseño" value={summary.pendingDesign} hint={`${summary.inspection} en inspección`} onClick={() => navigate(`${base}?status=idea,design`)} />
        <Stat label="Presupuesto" value={formatMoney(project.budget, project.currency, { compact: true })} hint={project.budget ? `${pct(estPct)} estimado` : 'sin definir'} />
        <Stat label="Gastado" value={formatMoney(spent, project.currency, { compact: true })} tone={spentPct > 100 ? 'danger' : 'default'} hint={project.budget ? `${pct(spentPct)} del presupuesto` : undefined} />
        <Stat label="Costo estimado" value={formatMoney(summary.costs.estimated, project.currency, { compact: true })} tone={project.budget && summary.costs.estimated > project.budget ? 'danger' : 'default'} hint={`${formatMoney(summary.costs.remainingEstimate, project.currency, { compact: true })} por ejecutar`} />
        <Stat label="Horas de taller" value={formatHours(summary.workshopHours)} hint={`${formatHours(summary.pendingWorkshopHours)} pendientes`} />
        <Stat label="Críticos abiertos" value={summary.critical} tone={summary.critical ? 'warning' : 'default'} onClick={() => navigate(`${base}?priority=critical`)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Mi trabajo */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Mi trabajo <span className="ml-1 text-xs font-normal text-muted-foreground">{mine.length} abiertos</span>
            </h2>
            <div className="flex items-center gap-2 text-xs">
              {mineOverdue ? <span className="text-red-600 font-medium">{mineOverdue} atrasados</span> : null}
              {mineBlocked ? <span className="text-red-600">{mineBlocked} bloqueados</span> : null}
              {mineSoon ? <span className="text-amber-600">{mineSoon} por vencer</span> : null}
              <Link to={`${base}?responsible=${user.id}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                Ver todos <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
          <ComponentTable
            components={mine.slice(0, 8)}
            dense
            emptyTitle="No tienes componentes pendientes"
            emptyDescription="Cuando seas responsable o colaborador de un componente aparecerá aquí."
            defaultSort={{ key: 'dueDate', dir: 'asc' }}
          />
        </section>

        {/* Alertas */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Alertas</h2>
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-600" /> Todo en orden. Sin alertas por ahora.
              </CardContent>
            </Card>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {alerts.slice(0, 8).map((a) => {
                const Icon = a.severity === 'info' ? Info : AlertTriangle;
                const inner = (
                  <span className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-snug', a.severity === 'danger' && 'border-red-200 bg-red-50 text-red-800', a.severity === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800', a.severity === 'info' && 'border-sky-200 bg-sky-50 text-sky-800', a.href && 'hover:brightness-95 transition-[filter]')}>
                    <Icon className="mt-0.5 size-3.5 shrink-0" />
                    {a.text}
                  </span>
                );
                return <li key={a.id}>{a.href ? <Link to={a.href}>{inner}</Link> : inner}</li>;
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Sistemas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sistemas</h2>
          <Link to={`/p/${project.id}/systems`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Comparar <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {systems.map((s) => {
            const comps = components.filter((c) => c.systemId === s.id);
            const sum = summarizeComponents(comps, blocking, today);
            const est = comps.reduce((acc, c) => acc + estimatedCost(c), 0);
            const lead = s.members.find((m) => m.role === 'lead');
            return (
              <Link key={s.id} to={`/p/${project.id}/systems/${s.id}`} className="group">
                <Card className="h-full transition-colors group-hover:bg-accent/40">
                  <CardHeader className="pb-1">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                        <span className="truncate">{s.name}</span>
                      </CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {sum.total} componentes · {sum.completed} completados
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular">{pct(sum.percent)}</span>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Progress value={sum.percent} size="sm" />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className={cn(sum.overdue && 'text-red-600 font-medium')}>{sum.overdue} atrasados</span>
                      <span className={cn(sum.blocked && 'text-red-600 font-medium')}>{sum.blocked} bloqueados</span>
                      <span>{formatHours(sum.workshopHours)} taller</span>
                      <span className={cn('ml-auto tabular', s.budget && est > s.budget && 'text-red-600 font-medium')}>
                        {formatMoney(est, project.currency, { compact: true })}
                        {s.budget ? ` / ${formatMoney(s.budget, project.currency, { compact: true })}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <UserChip user={lead ? (usersById.get(lead.id) ?? lead) : null} size="xs" muted />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Actividad reciente */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Actividad reciente</h2>
          <Link to={`/p/${project.id}/activity`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Ver historial <ArrowRight className="size-3" />
          </Link>
        </div>
        <Card>
          <CardContent className="pt-1 pb-1">
            <ActivityFeed logs={activity.data?.activity ?? []} compact />
          </CardContent>
        </Card>
      </section>

      <ComponentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
