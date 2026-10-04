import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Stat } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/hooks/use-project';
import { formatMoney, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { componentRealCost, computeCosts, COST_CATEGORIES, estimatedCost, purchasesForComponents, type CostCategory } from '@rdms/shared';
import { Link, useNavigate } from 'react-router';

const CATEGORY_COLORS: Record<CostCategory, string> = {
  estMaterialCost: 'bg-sky-500',
  estManufacturingCost: 'bg-orange-500',
  estShippingCost: 'bg-violet-500',
  estAdditionalCost: 'bg-slate-400',
};

export function BudgetPage() {
  const { project, systems, components, purchases } = useProject();
  const navigate = useNavigate();
  const currency = project.currency;
  const total = computeCosts(components, purchases, true);
  const budget = project.budget ?? 0;
  const available = budget - total.actual - total.committed;
  const byCategory = COST_CATEGORIES.map((c) => ({ ...c, value: components.reduce((a, x) => a + (x[c.key] ?? 0), 0) }));
  const catTotal = byCategory.reduce((a, c) => a + c.value, 0);

  const rows = systems.map((s) => {
    const comps = components.filter((c) => c.systemId === s.id);
    const ids = new Set(comps.map((c) => c.id));
    const costs = computeCosts(comps, purchasesForComponents(ids, purchases), false);
    return { s, comps, costs, variance: s.budget ? ((costs.estimated - s.budget) / s.budget) * 100 : null };
  });
  const unlinkedReceived = purchases.filter((p) => p.status === 'received' && p.componentIds.length === 0);

  const variances = components
    .map((c) => ({ c, est: estimatedCost(c), real: componentRealCost(c, purchases) }))
    .filter((x): x is { c: (typeof components)[number]; est: number; real: number } => x.real != null && x.est > 0)
    .map((x) => ({ ...x, diff: x.real - x.est, pctDiff: ((x.real - x.est) / x.est) * 100 }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const bar = (value: number, max: number) => `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Presupuesto" description="Estimado = suma de los componentes · Comprometido = compras pedidas o en tránsito · Gastado = costo real de componentes + compras recibidas sin componente." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Presupuesto" value={formatMoney(project.budget, currency, { compact: true })} hint={project.budget ? undefined : 'define el presupuesto en Configuración'} />
        <Stat label="Estimado" value={formatMoney(total.estimated, currency, { compact: true })} tone={budget && total.estimated > budget ? 'danger' : 'default'} hint={budget ? `${pct((total.estimated / budget) * 100)} del presupuesto` : undefined} />
        <Stat label="Gastado" value={formatMoney(total.actual, currency, { compact: true })} tone={budget && total.actual > budget ? 'danger' : 'default'} hint={budget ? `${pct((total.actual / budget) * 100)} del presupuesto` : undefined} />
        <Stat label="Comprometido" value={formatMoney(total.committed, currency, { compact: true })} tone="info" hint="pedido / en tránsito" onClick={() => navigate(`/p/${project.id}/purchases?status=ordered`)} />
        <Stat label="Por comprar" value={formatMoney(total.planned, currency, { compact: true })} tone="warning" hint="compras planificadas" onClick={() => navigate(`/p/${project.id}/purchases?status=to_buy`)} />
        <Stat label="Disponible" value={formatMoney(budget ? available : null, currency, { compact: true })} tone={budget && available < 0 ? 'danger' : 'success'} hint="presupuesto − gastado − comprometido" />
      </section>

      {budget ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" title="Gastado · Comprometido · Por ejecutar (estimado restante)">
              <div className="h-full bg-emerald-500" style={{ width: bar(total.actual, budget) }} title={`Gastado ${formatMoney(total.actual, currency)}`} />
              <div className="h-full bg-sky-500" style={{ width: bar(total.committed, budget) }} title={`Comprometido ${formatMoney(total.committed, currency)}`} />
              <div className="h-full bg-slate-300" style={{ width: bar(Math.max(0, total.remainingEstimate - total.committed), budget) }} title={`Estimado por ejecutar ${formatMoney(total.remainingEstimate, currency)}`} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Gastado {formatMoney(total.actual, currency)}</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky-500" /> Comprometido {formatMoney(total.committed, currency)}</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-slate-300" /> Estimado por ejecutar {formatMoney(total.remainingEstimate, currency)}</span>
              <span className="ml-auto">Presupuesto {formatMoney(budget, currency)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Por sistema</CardTitle>
              <CardDescription>Compara el estimado y lo gastado contra el presupuesto de cada sistema.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Sistema</TableHead>
                  <TableHead className="text-right">Presupuesto</TableHead>
                  <TableHead className="text-right">Estimado</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Comprometido</TableHead>
                  <TableHead className="text-right">Gastado</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Variación</TableHead>
                  <TableHead className="hidden lg:table-cell w-[160px]">Uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ s, costs, variance }) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/p/${project.id}/systems/${s.id}`)}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{s.code}</span>
                      <span className="font-medium">{s.name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular text-xs">{s.budget != null ? formatMoney(s.budget, currency) : '—'}</TableCell>
                    <TableCell className={cn('text-right tabular text-xs', s.budget && costs.estimated > s.budget && 'text-red-600 font-semibold')}>{formatMoney(costs.estimated, currency)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular text-xs">{formatMoney(costs.committed, currency)}</TableCell>
                    <TableCell className="text-right tabular text-xs">{formatMoney(costs.actual, currency)}</TableCell>
                    <TableCell className={cn('hidden md:table-cell text-right tabular text-xs', variance != null && variance > 0 ? 'text-red-600' : 'text-emerald-600')}>{variance == null ? '—' : `${variance > 0 ? '+' : ''}${Math.round(variance)}%`}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {s.budget ? (
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-emerald-500" style={{ width: bar(costs.actual, s.budget) }} />
                          <div className="h-full bg-sky-500" style={{ width: bar(costs.committed, s.budget) }} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">sin presupuesto</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {unlinkedReceived.length ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-xs text-muted-foreground">
                      Compras recibidas sin componente asociado ({unlinkedReceived.length}) — <Link to={`/p/${project.id}/purchases?status=received`} className="underline">ver</Link>
                    </TableCell>
                    <TableCell className="text-right tabular text-xs">{formatMoney(unlinkedReceived.reduce((a, p) => a + p.quantity * p.unitCost + p.shippingCost + p.additionalCost, 0), currency)}</TableCell>
                    <TableCell className="hidden md:table-cell" />
                    <TableCell className="hidden lg:table-cell" />
                  </TableRow>
                ) : null}
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular text-xs">{formatMoney(project.budget, currency)}</TableCell>
                  <TableCell className="text-right tabular text-xs">{formatMoney(total.estimated, currency)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular text-xs">{formatMoney(total.committed, currency)}</TableCell>
                  <TableCell className="text-right tabular text-xs">{formatMoney(total.actual, currency)}</TableCell>
                  <TableCell className={cn('hidden md:table-cell text-right tabular text-xs', budget && total.estimated > budget ? 'text-red-600' : 'text-emerald-600')}>{budget ? `${total.estimated > budget ? '+' : ''}${Math.round(((total.estimated - budget) / budget) * 100)}%` : '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell" />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Estimado por categoría</CardTitle>
              <CardDescription>Material · manufactura · envío · adicionales</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {byCategory.map((c) => (
                <div key={c.key} className={cn('h-full', CATEGORY_COLORS[c.key])} style={{ width: `${catTotal ? (c.value / catTotal) * 100 : 0}%` }} title={`${c.label}: ${formatMoney(c.value, currency)}`} />
              ))}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {byCategory.map((c) => (
                <li key={c.key} className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn('size-2.5 rounded-full', CATEGORY_COLORS[c.key])} /> {c.label}
                  </span>
                  <span className="tabular text-xs">
                    <b>{formatMoney(c.value, currency)}</b> <span className="text-muted-foreground">{catTotal ? pct((c.value / catTotal) * 100) : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Estimado vs. real por componente</CardTitle>
            <CardDescription>Solo componentes con costo real conocido (tecleado o por compras recibidas). Sirve para calibrar las estimaciones del próximo cohete.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {variances.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no hay componentes con costo real registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Componente</TableHead>
                  <TableHead className="text-right">Estimado</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variances.slice(0, 15).map(({ c, est, real, diff, pctDiff }) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/p/${project.id}/components/${c.id}`)}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{c.code}</span>
                      {c.name}
                    </TableCell>
                    <TableCell className="text-right tabular text-xs">{formatMoney(est, currency)}</TableCell>
                    <TableCell className="text-right tabular text-xs">{formatMoney(real, currency)}</TableCell>
                    <TableCell className={cn('text-right tabular text-xs font-medium', diff > 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {diff > 0 ? '+' : ''}
                      {formatMoney(diff, currency)} ({pctDiff > 0 ? '+' : ''}
                      {Math.round(pctDiff)}%)
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
