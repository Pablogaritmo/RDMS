import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Progress, UserChip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/hooks/use-project';
import { formatHours, formatMoney, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { estimatedCost, purchasesForComponents, summarizeComponents } from '@rdms/shared';
import { Layers, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

export function SystemsPage() {
  const { project, systems, components, blocking, today, usersById, canManageProject, purchases } = useProject();
  const navigate = useNavigate();

  const rows = systems.map((s) => {
    const comps = components.filter((c) => c.systemId === s.id);
    const sum = summarizeComponents(comps, blocking, today, purchasesForComponents(new Set(comps.map((c) => c.id)), purchases), false);
    const est = comps.reduce((acc, c) => acc + estimatedCost(c), 0);
    const lead = s.members.find((m) => m.role === 'lead');
    return { s, sum, est, lead };
  });
  const totals = summarizeComponents(components, blocking, today, purchases);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sistemas"
        description={`${systems.length} sistemas · ${components.length} componentes · avance global ${pct(totals.percent)}`}
        actions={
          canManageProject ? (
            <Button variant="outline" asChild>
              <Link to={`/p/${project.id}/settings#systems`}>
                <Settings /> Gestionar sistemas
              </Link>
            </Button>
          ) : null
        }
      />
      {systems.length === 0 ? (
        <EmptyState icon={Layers} title="Sin sistemas" description="El líder del proyecto puede crear sistemas (Aeroestructuras, Propulsión, Recuperación…) desde Configuración." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sistema</TableHead>
                <TableHead className="w-[220px] min-w-[180px]">Avance</TableHead>
                <TableHead className="text-right">Comp.</TableHead>
                <TableHead className="text-right">Atrasados</TableHead>
                <TableHead className="text-right">Bloqueados</TableHead>
                <TableHead className="hidden md:table-cell text-right">En fabricación</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Horas taller</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Costo est. / presupuesto</TableHead>
                <TableHead className="hidden xl:table-cell text-right">Gastado</TableHead>
                <TableHead className="hidden md:table-cell">Responsable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ s, sum, est, lead }) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/p/${project.id}/systems/${s.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground w-9">{s.code}</span>
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={sum.percent} size="sm" className="flex-1" />
                      <span className="w-9 text-right text-xs tabular">{pct(sum.percent)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular text-xs">
                    {sum.completed}/{sum.total}
                  </TableCell>
                  <TableCell className={cn('text-right tabular text-xs', sum.overdue && 'text-red-600 font-semibold')}>{sum.overdue}</TableCell>
                  <TableCell className={cn('text-right tabular text-xs', sum.blocked && 'text-red-600 font-semibold')}>{sum.blocked}</TableCell>
                  <TableCell className="hidden md:table-cell text-right tabular text-xs">{sum.inManufacturing}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular text-xs">{formatHours(sum.workshopHours)}</TableCell>
                  <TableCell className={cn('hidden sm:table-cell text-right tabular text-xs', s.budget && est > s.budget && 'text-red-600 font-semibold')}>
                    {formatMoney(est, project.currency)}
                    <span className="text-muted-foreground"> / {s.budget ? formatMoney(s.budget, project.currency) : '—'}</span>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-right tabular text-xs">{formatMoney(sum.costs.actual, project.currency)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <UserChip user={lead ? (usersById.get(lead.id) ?? lead) : null} size="xs" className="text-xs" />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                <TableCell>Total</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={totals.percent} size="sm" className="flex-1" />
                    <span className="w-9 text-right text-xs tabular">{pct(totals.percent)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular text-xs">
                  {totals.completed}/{totals.total}
                </TableCell>
                <TableCell className={cn('text-right tabular text-xs', totals.overdue && 'text-red-600')}>{totals.overdue}</TableCell>
                <TableCell className={cn('text-right tabular text-xs', totals.blocked && 'text-red-600')}>{totals.blocked}</TableCell>
                <TableCell className="hidden md:table-cell text-right tabular text-xs">{totals.inManufacturing}</TableCell>
                <TableCell className="hidden lg:table-cell text-right tabular text-xs">{formatHours(totals.workshopHours)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular text-xs">
                  {formatMoney(totals.costs.estimated, project.currency)}
                  <span className="text-muted-foreground"> / {project.budget ? formatMoney(project.budget, project.currency) : '—'}</span>
                </TableCell>
                <TableCell className="hidden xl:table-cell text-right tabular text-xs">{formatMoney(totals.costs.actual, project.currency)}</TableCell>
                <TableCell className="hidden md:table-cell" />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
