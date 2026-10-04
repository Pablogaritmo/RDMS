import { STATUS_DOT } from '@/components/domain/badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/input';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { formatDate } from '@/lib/format';
import { useMilestoneMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { addDaysISO, daysBetween, isDone, statusOrder, type Component } from '@rdms/shared';
import { Calendar, Flag, Settings } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

export function SchedulePage() {
  const data = useProject();
  const { project, systems, components, milestones, today, canManageProject } = data;
  const navigate = useNavigate();
  const milestoneMutation = useMilestoneMutation(project.id);
  const [onlyOpen, setOnlyOpen] = React.useState(true);
  const [showDeps, setShowDeps] = React.useState(true);
  const chartRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState<{ key: string; d: string; blocking: boolean }[]>([]);

  const scheduled = components.filter((c) => c.dueDate && (!onlyOpen || !isDone(c)));
  const scheduledIds = React.useMemo(() => new Set(scheduled.map((c) => c.id)), [scheduled]);

  // Measure bar positions after layout and draw dependency connectors (dep end → dependent start).
  React.useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart || !showDeps) {
      setEdges([]);
      return;
    }
    const compute = () => {
      const base = chart.getBoundingClientRect();
      const pos = new Map<string, { x1: number; x2: number; y: number }>();
      chart.querySelectorAll<HTMLElement>('[data-bar]').forEach((el) => {
        const r = el.getBoundingClientRect();
        pos.set(el.dataset.bar!, { x1: r.left - base.left, x2: r.right - base.left, y: r.top - base.top + r.height / 2 });
      });
      const next: { key: string; d: string; blocking: boolean }[] = [];
      for (const c of scheduled) {
        const to = pos.get(c.id);
        if (!to) continue;
        for (const depId of c.dependsOn) {
          const from = pos.get(depId);
          const dep = data.componentsById.get(depId);
          if (!from || !dep || !scheduledIds.has(depId)) continue;
          const blocking = !isDone(dep) && !isDone(c) && statusOrder(dep.status) < statusOrder(c.status);
          const dx = Math.max(24, Math.abs(to.x1 - from.x2) / 2);
          next.push({ key: `${depId}-${c.id}`, blocking, d: `M ${from.x2} ${from.y} C ${from.x2 + dx} ${from.y}, ${to.x1 - dx} ${to.y}, ${to.x1} ${to.y}` });
        }
      }
      setEdges(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(chart);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduled.length, onlyOpen, showDeps, components]);

  // --- time range
  const dates = [project.startDate, project.targetDate, today, ...milestones.map((m) => m.date), ...scheduled.flatMap((c) => [c.startDate, c.dueDate])].filter((d): d is string => !!d);
  const min = dates.reduce((a, b) => (a < b ? a : b), today);
  const max = dates.reduce((a, b) => (a > b ? a : b), today);
  const rangeStart = addDaysISO(min, -7);
  const rangeEnd = addDaysISO(max, 14);
  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd));
  const x = (iso: string) => Math.min(100, Math.max(0, (daysBetween(rangeStart, iso) / totalDays) * 100));

  const months: { label: string; left: number; width: number }[] = [];
  {
    let cursor = `${rangeStart.slice(0, 7)}-01`;
    while (cursor <= rangeEnd) {
      const d = new Date(`${cursor}T00:00:00`);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const nextIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
      const left = x(cursor < rangeStart ? rangeStart : cursor);
      const right = x(nextIso > rangeEnd ? rangeEnd : nextIso);
      months.push({ label: d.toLocaleDateString('es-CR', { month: 'short', year: '2-digit' }), left, width: right - left });
      cursor = nextIso;
    }
  }

  const barStart = (c: Component) => c.startDate ?? (c.createdAt.slice(0, 10) < c.dueDate! ? c.createdAt.slice(0, 10) : addDaysISO(c.dueDate!, -14));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cronograma"
        description={`${formatDate(rangeStart)} → ${formatDate(rangeEnd)} · ${scheduled.length} componentes con fecha límite`}
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Solo abiertos
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} /> Dependencias
            </label>
            {canManageProject ? (
              <Button variant="outline" asChild>
                <Link to={`/p/${project.id}/settings#milestones`}>
                  <Settings /> Gestionar hitos
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/* Milestones */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {milestones.length === 0 ? (
          <EmptyState icon={Flag} title="Sin hitos" description="Define hitos como PDR, CDR, prueba estática o lanzamiento desde Configuración." className="md:col-span-2 xl:col-span-4" />
        ) : null}
        {milestones.map((m) => {
          const days = daysBetween(today, m.date);
          const pending = components.filter((c) => !isDone(c) && c.dueDate && c.dueDate <= m.date);
          const overdueForMilestone = pending.filter((c) => data.isOverdue(c)).length;
          const done = !!m.completedAt;
          return (
            <Card key={m.id} className={cn(done && 'opacity-70', !done && days < 0 && 'border-red-200')}>
              <CardHeader className="pb-1">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-1.5">
                    <Flag className={cn('size-3.5', done ? 'text-emerald-600' : days < 0 ? 'text-red-600' : 'text-muted-foreground')} />
                    <span className="truncate">{m.name}</span>
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(m.date)} · {done ? 'completado' : days === 0 ? 'hoy' : days > 0 ? `en ${days} días` : `hace ${-days} días`}
                  </p>
                </div>
                {canManageProject ? (
                  <Checkbox
                    checked={done}
                    title={done ? 'Marcar como pendiente' : 'Marcar como completado'}
                    onChange={(e) => milestoneMutation.mutate({ id: m.id, input: { completedAt: e.target.checked ? today : null } }, { onError: (err) => toast.error(err.message) })}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {done ? (
                  <p className="text-xs text-muted-foreground">{m.description ?? 'Hito alcanzado.'}</p>
                ) : pending.length === 0 ? (
                  <p className="text-xs text-emerald-700">Nada pendiente con fecha anterior a este hito.</p>
                ) : (
                  <Link to={`/p/${project.id}/components?before=${m.date}&flag=open`} className="block text-xs hover:underline">
                    <b>{pending.length}</b> componente(s) deben estar listos antes{overdueForMilestone ? <span className="text-red-600"> · {overdueForMilestone} ya atrasados</span> : null}
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Gantt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" /> Línea de tiempo
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-sky-500" /> diseño
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-orange-500" /> fabricación
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-emerald-500" /> completado
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm border-2 border-red-500" /> atrasado
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="18" height="8"><path d="M0 4 H18" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 2" /></svg> depende de
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="18" height="8"><path d="M0 4 H18" stroke="#dc2626" strokeWidth="1.5" /></svg> bloqueando
            </span>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* axis */}
            <div className="relative ml-[200px] h-6 border-b text-[10px] text-muted-foreground">
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full border-l pl-1 leading-6" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                  {m.width > 4 ? m.label : ''}
                </div>
              ))}
            </div>
            <div className="relative" ref={chartRef}>
              {edges.length ? (
                <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
                  <defs>
                    <marker id="arrow-slate" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0 0 L8 4 L0 8 z" fill="#94a3b8" />
                    </marker>
                    <marker id="arrow-red" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0 0 L8 4 L0 8 z" fill="#dc2626" />
                    </marker>
                  </defs>
                  {edges.map((e) => (
                    <path key={e.key} d={e.d} fill="none" stroke={e.blocking ? '#dc2626' : '#94a3b8'} strokeWidth={e.blocking ? 1.8 : 1.2} strokeDasharray={e.blocking ? undefined : '4 3'} markerEnd={`url(#${e.blocking ? 'arrow-red' : 'arrow-slate'})`} opacity={0.9} />
                  ))}
                </svg>
              ) : null}
              {/* milestone lines + today */}
              <div className="pointer-events-none absolute inset-y-0 left-[200px] right-0">
                {milestones.map((m, i) => {
                  const prev = i > 0 ? x(milestones[i - 1].date) : -100;
                  const showLabel = x(m.date) - prev > 5;
                  return (
                    <div key={m.id} className="absolute inset-y-0 border-l border-dashed border-violet-400/70" style={{ left: `${x(m.date)}%` }} title={`${m.name} · ${formatDate(m.date)}`}>
                      {showLabel ? <span className="absolute -top-0 left-1 max-w-[80px] truncate text-[9px] text-violet-700">{m.name.split(' — ')[0]}</span> : null}
                    </div>
                  );
                })}
                <div className="absolute inset-y-0 border-l-2 border-red-500/70" style={{ left: `${x(today)}%` }} title={`Hoy · ${formatDate(today)}`} />
              </div>

              {systems.map((s) => {
                const rows = scheduled.filter((c) => c.systemId === s.id).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
                if (rows.length === 0) return null;
                return (
                  <div key={s.id} className="pt-3">
                    <div className="flex items-center gap-2 px-1 text-xs font-semibold">
                      <span className="font-mono text-muted-foreground">{s.code}</span> {s.name}
                    </div>
                    {rows.map((c) => {
                      const start = barStart(c);
                      const left = x(start);
                      const width = Math.max(0.6, x(c.dueDate!) - left);
                      const overdue = data.isOverdue(c);
                      return (
                        <div key={c.id} className="group flex h-7 items-center text-xs hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/p/${project.id}/components/${c.id}`)}>
                          <div className="flex w-[200px] shrink-0 items-center gap-1.5 truncate pr-2">
                            <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span>
                            <span className="truncate">{c.name}</span>
                          </div>
                          <div className="relative h-full flex-1">
                            <div
                              data-bar={c.id}
                              className={cn('absolute top-1.5 h-4 rounded-sm opacity-90 group-hover:opacity-100', STATUS_DOT[c.status], overdue && 'ring-2 ring-red-500 ring-inset')}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${c.code} ${c.name}\n${formatDate(start)} → ${formatDate(c.dueDate)}`}
                            />
                            {data.isBlocked(c) ? (
                              <Badge variant="danger" className="absolute top-1 px-1 py-0 text-[9px]" style={{ left: `calc(${left + width}% + 4px)` }}>
                                bloq.
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {scheduled.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">Ningún componente tiene fecha límite todavía.</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
