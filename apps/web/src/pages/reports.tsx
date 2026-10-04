import { StatusBadge } from '@/components/domain/badges';
import { PurchaseStatusBadge } from '@/components/domain/purchase-form';
import { TestStatusBadge } from '@/components/domain/test-form';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { PageHeader, Progress } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject, type ProjectData } from '@/hooks/use-project';
import { formatDate, formatHours, formatMoney, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  computeCosts,
  estimatedCost,
  groupByMachine,
  isDone,
  isFabricable,
  MANUFACTURING_PROCESSES,
  manufacturingMinutes,
  purchaseArrival,
  purchaseRisks,
  purchaseTotal,
  purchasesForComponents,
  STATUS_BY_KEY,
  summarizeComponents,
  type Component,
} from '@rdms/shared';
import { Printer } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router';

const REPORTS = [
  { key: 'status', label: 'Estado del proyecto' },
  { key: 'manufacturing', label: 'Manufactura' },
  { key: 'procurement', label: 'Compras' },
  { key: 'design', label: 'Revisión de diseño' },
] as const;
type ReportKey = (typeof REPORTS)[number]['key'];

export function ReportsPage() {
  const data = useProject();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('r') as ReportKey | null) ?? 'status';
  const [reviewTitle, setReviewTitle] = React.useState('');

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader
          title="Reportes"
          description="Generados en vivo a partir de los datos del proyecto. Usa «Imprimir» para guardarlos en PDF."
          actions={
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Imprimir / PDF
            </Button>
          }
        />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ r: v }, { replace: true })}>
        <TabsList className="print:hidden">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="status">
          <ReportFrame data={data} title="Project Status Report">
            <StatusReport data={data} />
          </ReportFrame>
        </TabsContent>
        <TabsContent value="manufacturing">
          <ReportFrame data={data} title="Manufacturing Report">
            <ManufacturingReport data={data} />
          </ReportFrame>
        </TabsContent>
        <TabsContent value="procurement">
          <ReportFrame data={data} title="Procurement Report">
            <ProcurementReport data={data} />
          </ReportFrame>
        </TabsContent>
        <TabsContent value="design">
          <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-xs text-muted-foreground">Revisión:</span>
            <NativeSelect value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} className="h-8 w-64 text-xs">
              <option value="">Design Review</option>
              {data.milestones.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
            <Input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="o escribe un título (SRR, PDR, CDR, TRR…)" className="h-8 w-72 text-xs" />
          </div>
          <ReportFrame data={data} title={reviewTitle || 'Design Review'}>
            <DesignReviewReport data={data} />
          </ReportFrame>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportFrame({ data, title, children }: { data: ProjectData; title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border bg-card p-6 shadow-xs print:border-0 print:p-0 print:shadow-none">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CRATER · GIA · UCR</p>
          <h2 className="text-lg font-semibold">
            {title} — {data.project.name}
          </h2>
          <p className="text-xs text-muted-foreground">{data.project.competition}</p>
        </div>
        <p className="text-xs text-muted-foreground">Generado el {formatDate(data.today)} · RDMS</p>
      </header>
      <div className="flex flex-col gap-6 text-sm">{children}</div>
    </article>
  );
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 text-sm font-semibold">
        {title}
        {hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function Kv({ items }: { items: { label: string; value: React.ReactNode; tone?: 'danger' | 'warning' | 'success' }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((i) => (
        <div key={i.label} className="rounded-md border px-3 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{i.label}</dt>
          <dd className={cn('text-base font-semibold tabular', i.tone === 'danger' && 'text-red-600', i.tone === 'warning' && 'text-amber-600', i.tone === 'success' && 'text-emerald-600')}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SimpleTable({ head, rows, empty }: { head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty ?? 'Sin elementos.'}</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
          {head.map((h, i) => (
            <th key={i} className="py-1 pr-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-dashed last:border-0">
            {r.map((cell, j) => (
              <td key={j} className="py-1 pr-2 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Code = ({ c }: { c: Component }) => (
  <span>
    <span className="font-mono text-muted-foreground mr-1">{c.code}</span>
    {c.name}
  </span>
);

// ------------------------------------------------------------------ Status

function StatusReport({ data }: { data: ProjectData }) {
  const { project, components, systems, milestones, blocking, today, purchases, usersById, systemsById, componentsById } = data;
  const s = summarizeComponents(components, blocking, today, purchases);
  const open = components.filter((c) => !isDone(c));
  const overdue = open.filter(data.isOverdue).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const critical = open.filter((c) => c.priority === 'critical');
  const bottlenecks = open.map((c) => ({ c, n: blocking.get(c.id)?.blocking.length ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const risks = purchaseRisks(purchases, componentsById, today);
  const upcoming = milestones.filter((m) => !m.completedAt && m.date >= today).slice(0, 4);
  const cur = project.currency;
  return (
    <>
      <Section title="Avance general">
        <div className="mb-3 flex items-center gap-3">
          <Progress value={s.percent} className="flex-1" />
          <b className="tabular">{pct(s.percent)}</b>
          <span className="text-xs text-muted-foreground">
            {s.completed}/{s.total} completados
          </span>
        </div>
        <Kv
          items={[
            { label: 'Componentes', value: s.total },
            { label: 'Atrasados', value: s.overdue, tone: s.overdue ? 'danger' : undefined },
            { label: 'Bloqueados', value: s.blocked, tone: s.blocked ? 'danger' : undefined },
            { label: 'En fabricación', value: s.inManufacturing },
            { label: 'Críticos abiertos', value: s.critical, tone: s.critical ? 'warning' : undefined },
            { label: 'Horas de taller pend.', value: formatHours(s.pendingWorkshopHours) },
          ]}
        />
      </Section>
      <Section title="Avance por sistema">
        <SimpleTable
          head={['Sistema', 'Avance', 'Comp.', 'Atrasados', 'Bloqueados', 'Estimado', 'Gastado', 'Responsable']}
          rows={systems.map((sys) => {
            const comps = components.filter((c) => c.systemId === sys.id);
            const ss = summarizeComponents(comps, blocking, today, purchasesForComponents(new Set(comps.map((c) => c.id)), purchases), false);
            const lead = sys.members.find((m) => m.role === 'lead');
            return [
              <b key="n">{sys.name}</b>,
              <span key="p" className="tabular">
                {pct(ss.percent)}
              </span>,
              `${ss.completed}/${ss.total}`,
              <span key="o" className={cn(ss.overdue && 'text-red-600 font-medium')}>
                {ss.overdue}
              </span>,
              <span key="b" className={cn(ss.blocked && 'text-red-600 font-medium')}>
                {ss.blocked}
              </span>,
              formatMoney(ss.costs.estimated, cur),
              formatMoney(ss.costs.actual, cur),
              lead?.name ?? '—',
            ];
          })}
        />
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Componentes atrasados" hint={`${overdue.length}`}>
          <SimpleTable head={['Componente', 'Estado', 'Límite', 'Responsable']} rows={overdue.map((c) => [<Code key="c" c={c} />, STATUS_BY_KEY[c.status].label, formatDate(c.dueDate), c.responsibleId ? (usersById.get(c.responsibleId)?.name ?? '—') : '—'])} empty="Ningún componente atrasado." />
        </Section>
        <Section title="Componentes críticos abiertos" hint={`${critical.length}`}>
          <SimpleTable head={['Componente', 'Sistema', 'Estado', 'Límite']} rows={critical.map((c) => [<Code key="c" c={c} />, systemsById.get(c.systemId)?.code, STATUS_BY_KEY[c.status].label, formatDate(c.dueDate)])} empty="Sin componentes críticos abiertos." />
        </Section>
      </div>
      <Section title="Presupuesto">
        <Kv
          items={[
            { label: 'Presupuesto', value: formatMoney(project.budget, cur, { compact: true }) },
            { label: 'Estimado', value: formatMoney(s.costs.estimated, cur, { compact: true }), tone: project.budget && s.costs.estimated > project.budget ? 'danger' : undefined },
            { label: 'Gastado', value: formatMoney(s.costs.actual, cur, { compact: true }) },
            { label: 'Comprometido', value: formatMoney(s.costs.committed, cur, { compact: true }) },
            { label: 'Por comprar', value: formatMoney(s.costs.planned, cur, { compact: true }) },
            { label: 'Disponible', value: formatMoney(project.budget ? project.budget - s.costs.actual - s.costs.committed : null, cur, { compact: true }) },
          ]}
        />
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Riesgos: dependencias" hint="componentes que bloquean a otros">
          <SimpleTable head={['Componente', 'Estado', 'Bloquea']} rows={bottlenecks.map(({ c, n }) => [<Code key="c" c={c} />, STATUS_BY_KEY[c.status].label, `${n} componente(s)`])} empty="No hay cuellos de botella." />
        </Section>
        <Section title="Riesgos: compras" hint="entregas que chocan con fechas límite">
          <SimpleTable
            head={['Compra', 'Componente', 'Detalle']}
            rows={risks.map((r) => [r.purchase.name, r.component.code, r.reason === 'late' ? `llega ${formatDate(r.arrival)}, límite ${formatDate(r.component.dueDate)} (${r.daysLate} d tarde)` : 'sin pedir y la pieza ya está en fabricación'])}
            empty="Sin compras críticas."
          />
        </Section>
      </div>
      <Section title="Próximos hitos">
        <SimpleTable
          head={['Hito', 'Fecha', 'Pendientes antes del hito', 'Ya atrasados']}
          rows={upcoming.map((m) => {
            const pending = open.filter((c) => c.dueDate && c.dueDate <= m.date);
            return [<b key="m">{m.name}</b>, formatDate(m.date), pending.length, <span key="o" className={cn(pending.filter(data.isOverdue).length && 'text-red-600 font-medium')}>{pending.filter(data.isOverdue).length}</span>];
          })}
          empty="Sin hitos futuros."
        />
      </Section>
    </>
  );
}

// ----------------------------------------------------------- Manufacturing

function ManufacturingReport({ data }: { data: ProjectData }) {
  const { components, systems, systemsById, usersById } = data;
  const fab = components.filter((c) => isFabricable(c) && !isDone(c)).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const groups = groupByMachine(components.filter((c) => !isDone(c)));
  return (
    <>
      <Section title="Resumen">
        <Kv
          items={[
            { label: 'Piezas por fabricar', value: fab.length },
            { label: 'Horas pendientes', value: formatHours(groups.reduce((a, g) => a + g.pendingMinutes, 0) / 60) },
            { label: 'Máquinas / procesos', value: groups.length },
            { label: 'Sin datos de taller', value: fab.filter((c) => !c.manufacturing).length, tone: fab.some((c) => !c.manufacturing) ? 'warning' : undefined },
          ]}
        />
      </Section>
      <Section title="Horas por máquina / proceso">
        <SimpleTable head={['Máquina / proceso', 'Taller', 'Piezas', 'Horas pendientes']} rows={groups.map((g) => [<b key="g">{g.label}</b>, g.workshop ?? '—', g.components.filter((c) => !isDone(c)).length, formatHours(g.pendingMinutes / 60)])} />
      </Section>
      <Section title="Horas por sistema">
        <SimpleTable
          head={['Sistema', 'Piezas pendientes', 'Horas pendientes']}
          rows={systems
            .map((s) => {
              const comps = components.filter((c) => c.systemId === s.id && !isDone(c) && c.manufacturing);
              const minutes = comps.reduce((a, c) => a + manufacturingMinutes(c.manufacturing) * Math.max(1, c.quantity), 0);
              return { s, comps, minutes };
            })
            .filter((x) => x.comps.length)
            .map((x) => [<b key="s">{x.s.name}</b>, x.comps.length, formatHours(x.minutes / 60)])}
        />
      </Section>
      <Section title="Componentes a fabricar" hint="ordenados por fecha límite">
        <SimpleTable
          head={['Componente', 'Sistema', 'Estado', 'Proceso / máquina', 'Material', 'Tiempo', 'Responsable', 'Límite']}
          rows={fab.map((c) => {
            const m = c.manufacturing;
            return [
              <Code key="c" c={c} />,
              systemsById.get(c.systemId)?.code,
              STATUS_BY_KEY[c.status].label,
              m ? `${m.process ? MANUFACTURING_PROCESSES.find((p) => p.key === m.process)?.label : '—'}${m.machine ? ` · ${m.machine}` : ''}` : <span className="text-amber-700">sin datos</span>,
              c.material ?? '—',
              m ? formatHours((manufacturingMinutes(m) * Math.max(1, c.quantity)) / 60) : '—',
              (m?.responsibleId && usersById.get(m.responsibleId)?.name) || (c.responsibleId && usersById.get(c.responsibleId)?.name) || '—',
              <span key="d" className={cn(data.isOverdue(c) && 'text-red-600 font-medium')}>
                {formatDate(c.dueDate)}
              </span>,
            ];
          })}
          empty="No hay piezas pendientes de fabricar."
        />
      </Section>
    </>
  );
}

// ------------------------------------------------------------- Procurement

function ProcurementReport({ data }: { data: ProjectData }) {
  const { purchases, componentsById, today, project, usersById } = data;
  const cur = project.currency;
  const pending = purchases.filter((p) => ['to_buy', 'ordered', 'in_transit'].includes(p.status));
  const received = purchases.filter((p) => p.status === 'received');
  const risks = purchaseRisks(purchases, componentsById, today);
  const sum = (xs: typeof purchases) => xs.reduce((a, p) => a + purchaseTotal(p), 0);
  return (
    <>
      <Section title="Resumen">
        <Kv
          items={[
            { label: 'Por comprar', value: formatMoney(sum(purchases.filter((p) => p.status === 'to_buy')), cur, { compact: true }), tone: 'warning' },
            { label: 'Comprometido', value: formatMoney(sum(purchases.filter((p) => p.status === 'ordered' || p.status === 'in_transit')), cur, { compact: true }) },
            { label: 'Recibido', value: formatMoney(sum(received), cur, { compact: true }), tone: 'success' },
            { label: 'Compras críticas', value: new Set(risks.map((r) => r.purchase.id)).size, tone: risks.length ? 'danger' : undefined },
          ]}
        />
      </Section>
      <Section title="Compras críticas">
        <SimpleTable head={['Compra', 'Componente', 'Detalle']} rows={risks.map((r) => [<b key="p">{r.purchase.name}</b>, r.component.code, r.reason === 'late' ? `llega ${formatDate(r.arrival)}, límite ${formatDate(r.component.dueDate)} (${r.daysLate} d tarde)` : 'sin pedir y la pieza ya está en fabricación'])} empty="Sin compras críticas." />
      </Section>
      <Section title="Compras pendientes" hint={`${pending.length}`}>
        <SimpleTable
          head={['Compra', 'Proveedor', 'Componentes', 'Estado', 'Llegada', 'Total', 'Solicitó']}
          rows={pending.map((p) => [
            <b key="n">{p.name}</b>,
            p.supplier ?? '—',
            p.componentIds.map((id) => componentsById.get(id)?.code).filter(Boolean).join(', ') || '—',
            <PurchaseStatusBadge key="s" status={p.status} />,
            formatDate(purchaseArrival(p, today)) || 'sin estimar',
            formatMoney(purchaseTotal(p), cur),
            p.requestedById ? (usersById.get(p.requestedById)?.name ?? '—') : '—',
          ])}
          empty="No hay compras pendientes."
        />
      </Section>
      <Section title="Compras recibidas" hint={`${received.length} · ${formatMoney(sum(received), cur)}`}>
        <SimpleTable head={['Compra', 'Proveedor', 'Pedido', 'Recibido', 'Total']} rows={received.map((p) => [p.name, p.supplier ?? '—', formatDate(p.orderedAt), formatDate(p.receivedAt), formatMoney(purchaseTotal(p), cur)])} empty="Nada recibido todavía." />
      </Section>
    </>
  );
}

// ----------------------------------------------------------- Design review

function DesignReviewReport({ data }: { data: ProjectData }) {
  const { systems, components, files, tests, blocking, usersById, project, purchases } = data;
  const cur = project.currency;
  const costs = computeCosts(components, purchases);
  return (
    <>
      <Section title="Resumen del diseño">
        <Kv
          items={[
            { label: 'Componentes', value: components.length },
            { label: 'Diseño aprobado o más', value: components.filter((c) => STATUS_BY_KEY[c.status].order >= STATUS_BY_KEY.design_approved.order).length },
            { label: 'Aún en idea/diseño', value: components.filter((c) => c.status === 'idea' || c.status === 'design').length, tone: 'warning' },
            { label: 'Planos / CAD', value: files.filter((f) => f.entityType === 'component' && (f.category === 'drawing' || f.category === 'cad')).length },
            { label: 'Pruebas aprobadas', value: tests.filter((t) => t.status === 'passed').length, tone: 'success' },
            { label: 'Costo estimado', value: formatMoney(costs.estimated, cur, { compact: true }) },
          ]}
        />
      </Section>
      {systems.map((s) => {
        const comps = components.filter((c) => c.systemId === s.id);
        if (comps.length === 0) return null;
        const lead = s.members.find((m) => m.role === 'lead');
        return (
          <Section key={s.id} title={`${s.code} · ${s.name}`} hint={`${comps.length} componentes · líder ${lead?.name ?? '—'} · estimado ${formatMoney(comps.reduce((a, c) => a + estimatedCost(c), 0), cur)}`}>
            <SimpleTable
              head={['Componente', 'Estado', 'Diseñador', 'Aprobado', 'Planos', 'Pruebas', 'Dependencias abiertas', 'Material', 'Estimado']}
              rows={comps.map((c) => {
                const drawings = files.filter((f) => f.entityType === 'component' && f.entityId === c.id && (f.category === 'drawing' || f.category === 'cad'));
                const ct = tests.filter((t) => t.componentId === c.id);
                const openDeps = c.dependsOn.map((id) => data.componentsById.get(id)).filter((d): d is Component => !!d && !isDone(d));
                const b = blocking.get(c.id);
                return [
                  <Code key="c" c={c} />,
                  <StatusBadge key="s" status={c.status} />,
                  c.designerId ? (usersById.get(c.designerId)?.name ?? '—') : '—',
                  formatDate(c.designApprovedAt),
                  drawings.length ? `${drawings.length}` : <span className="text-amber-700">0</span>,
                  ct.length ? (
                    <span key="t" className="inline-flex flex-wrap gap-1">
                      {ct.map((t) => (
                        <TestStatusBadge key={t.id} status={t.status} />
                      ))}
                    </span>
                  ) : (
                    '—'
                  ),
                  openDeps.length ? (
                    <span key="d" className={cn(b?.blockedBy.length && 'text-red-600 font-medium')}>
                      {openDeps.map((d) => d.code).join(', ')}
                    </span>
                  ) : (
                    '—'
                  ),
                  c.material ?? '—',
                  formatMoney(estimatedCost(c), cur),
                ];
              })}
            />
          </Section>
        );
      })}
    </>
  );
}
