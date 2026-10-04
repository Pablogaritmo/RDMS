import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Skeleton, Stat } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { formatMoney, formatNumber, pct } from '@/lib/format';
import { useMetrics } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { summarizeComponents } from '@rdms/shared';
import * as React from 'react';
import { Link } from 'react-router';

export function MetricsPage() {
  const { project, components, blocking, today, purchases } = useProject();
  const metrics = useMetrics(project.id);
  const m = metrics.data;
  const summary = React.useMemo(() => summarizeComponents(components, blocking, today, purchases), [components, blocking, today, purchases]);
  const currency = project.currency;

  if (!m) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Métricas" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      </div>
    );
  }

  const costDelta = m.totalEstimatedKnown ? ((m.totalActualKnown - m.totalEstimatedKnown) / m.totalEstimatedKnown) * 100 : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Métricas" description="Indicadores derivados del historial para aprender de este cohete y estimar mejor el siguiente. Se calculan en vivo, nada se captura a mano." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Completados" value={pct(summary.total ? (summary.completed / summary.total) * 100 : 0)} hint={`${summary.completed} de ${summary.total}`} />
        <Stat label="Atrasados" value={pct(summary.total ? (summary.overdue / summary.total) * 100 : 0)} tone={summary.overdue ? 'danger' : 'default'} hint={`${summary.overdue} componentes`} />
        <Stat label="Entregas a tiempo" value={m.onTimeRate == null ? '—' : pct(m.onTimeRate)} tone={m.onTimeRate != null && m.onTimeRate < 60 ? 'warning' : 'success'} hint={m.avgScheduleVarianceDays == null ? 'sin completados con fecha' : `desvío medio ${m.avgScheduleVarianceDays > 0 ? '+' : ''}${m.avgScheduleVarianceDays} días`} />
        <Stat label="Fabricación media" value={m.avgManufacturingDays == null ? '—' : `${formatNumber(m.avgManufacturingDays, 1)} d`} hint={`${m.manufacturingDurations.length} piezas medidas`} />
        <Stat label="Adquisición media" value={m.avgAcquisitionDays == null ? '—' : `${formatNumber(m.avgAcquisitionDays, 1)} d`} hint={`${m.acquisitionTimes.length} compras pedido→recibido`} />
        <Stat label="Costo real vs estimado" value={costDelta == null ? '—' : `${costDelta > 0 ? '+' : ''}${Math.round(costDelta)}%`} tone={costDelta != null && costDelta > 10 ? 'danger' : 'default'} hint={`${m.costVariance.length} componentes con costo real`} />
        <Stat label="Reprocesos" value={m.reworkedComponents.length} tone={m.reworkedComponents.length ? 'warning' : 'default'} hint="componentes que retrocedieron de etapa" />
        <Stat label="Pruebas fallidas" value={m.testsFailed} tone={m.testsFailed ? 'danger' : 'default'} hint={`${m.testsPassed} aprobadas`} />
        <Stat label="Inspecciones rechazadas" value={m.inspectionsRejected} tone={m.inspectionsRejected ? 'warning' : 'default'} hint={`de ${m.inspectionsTotal}`} />
        <Stat label="Horas de taller" value={`${formatNumber(summary.workshopHours, 1)} h`} hint={`${formatNumber(summary.pendingWorkshopHours, 1)} h pendientes`} />
        <Stat label="Cambios de estado (30 d)" value={m.statusChangesLast30Days} hint="ritmo del equipo" />
        <Stat label="Personas activas (30 d)" value={m.activeContributorsLast30Days} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Costo estimado vs. real</CardTitle>
              <CardDescription>Componentes con costo real conocido. Total estimado {formatMoney(m.totalEstimatedKnown, currency)} · real {formatMoney(m.totalActualKnown, currency)}.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {m.costVariance.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos todavía.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {m.costVariance
                  .slice()
                  .sort((a, b) => Math.abs(b.actual - b.estimated) - Math.abs(a.actual - a.estimated))
                  .slice(0, 10)
                  .map((x) => {
                    const max = Math.max(x.estimated, x.actual);
                    return (
                      <li key={x.id} className="text-xs">
                        <div className="flex items-center justify-between">
                          <Link to={`/p/${project.id}/components/${x.id}`} className="truncate hover:underline">
                            <span className="font-mono text-muted-foreground mr-1">{x.code}</span>
                            {x.name}
                          </Link>
                          <span className={cn('tabular', x.actual > x.estimated ? 'text-red-600' : 'text-emerald-600')}>
                            {x.actual > x.estimated ? '+' : ''}
                            {Math.round(((x.actual - x.estimated) / x.estimated) * 100)}%
                          </span>
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5">
                          <div className="h-1.5 rounded-full bg-slate-300" style={{ width: `${(x.estimated / max) * 100}%` }} title={`Estimado ${formatMoney(x.estimated, currency)}`} />
                          <div className={cn('h-1.5 rounded-full', x.actual > x.estimated ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${(x.actual / max) * 100}%` }} title={`Real ${formatMoney(x.actual, currency)}`} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cumplimiento de fechas</CardTitle>
              <CardDescription>Días de diferencia entre la fecha límite y la fecha real de completado (negativo = antes de tiempo).</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {m.scheduleVariance.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aún no hay componentes completados con fecha límite.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-xs">
                {m.scheduleVariance
                  .slice()
                  .sort((a, b) => b.days - a.days)
                  .slice(0, 12)
                  .map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2">
                      <Link to={`/p/${project.id}/components/${x.id}`} className="truncate hover:underline">
                        <span className="font-mono text-muted-foreground mr-1">{x.code}</span>
                        {x.name}
                      </Link>
                      <span className={cn('shrink-0 tabular font-medium', x.days > 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {x.days > 0 ? `+${x.days} d tarde` : x.days === 0 ? 'a tiempo' : `${-x.days} d antes`}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Reprocesos</CardTitle>
              <CardDescription>Componentes que regresaron a una etapa anterior (rediseño, re-fabricación, inspección rechazada).</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {m.reworkedComponents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ningún componente ha retrocedido de etapa.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-xs">
                {m.reworkedComponents.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    <Link to={`/p/${project.id}/components/${x.id}`} className="truncate hover:underline">
                      <span className="font-mono text-muted-foreground mr-1">{x.code}</span>
                      {x.name}
                    </Link>
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">{x.count} {x.count === 1 ? 'vez' : 'veces'}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Tiempos de fabricación y adquisición</CardTitle>
              <CardDescription>Días desde que entra a fabricación hasta completarse · días desde el pedido hasta la recepción.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fabricación</p>
              {m.manufacturingDurations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin piezas completadas que hayan pasado por fabricación.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs">
                  {m.manufacturingDurations.slice(0, 8).map((x) => (
                    <li key={x.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        <span className="font-mono text-muted-foreground mr-1">{x.code}</span>
                        {x.name}
                      </span>
                      <span className="tabular">{x.days} d</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Adquisición</p>
              {m.acquisitionTimes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin compras con fecha de pedido y recepción.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs">
                  {m.acquisitionTimes.slice(0, 8).map((x) => (
                    <li key={x.id} className="flex justify-between gap-2">
                      <span className="truncate">{x.name}</span>
                      <span className="tabular">{x.days} d</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
