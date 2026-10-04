import { StatusBadge } from '@/components/domain/badges';
import { ManufacturingDialog } from '@/components/domain/manufacturing-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Stat, UserChip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/hooks/use-project';
import { dueLabel, formatDate, formatHours } from '@/lib/format';
import { cn } from '@/lib/utils';
import { groupByMachine, isDone, isFabricable, MANUFACTURING_PROCESSES, manufacturingHours, manufacturingMinutes, type Component } from '@rdms/shared';
import { ChevronDown, ChevronRight, Factory, Wrench } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';

export function ManufacturingPage() {
  const data = useProject();
  const { project, components, systems, usersById, systemsById, canEdit, today } = data;
  const navigate = useNavigate();
  const [onlyPending, setOnlyPending] = React.useState(true);
  const [workshop, setWorkshop] = React.useState('');
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [editing, setEditing] = React.useState<Component | null>(null);

  const fabricable = components.filter(isFabricable);
  const workshops = [...new Set(fabricable.map((c) => c.manufacturing?.workshop).filter((w): w is string => !!w))].sort();
  const scoped = fabricable.filter((c) => (!onlyPending || !isDone(c)) && (!workshop || c.manufacturing?.workshop === workshop));
  const groups = groupByMachine(scoped);
  const missingData = components.filter((c) => !c.manufacturing && ['pending_manufacturing', 'in_manufacturing'].includes(c.status));
  const queue = components
    .filter((c) => ['pending_manufacturing', 'in_manufacturing', 'inspection'].includes(c.status))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  const totalHours = manufacturingHours(components);
  const pendingHours = manufacturingHours(components, true);
  const perSystem = systems
    .map((s) => {
      const comps = components.filter((c) => c.systemId === s.id);
      return { s, total: manufacturingHours(comps), pending: manufacturingHours(comps, true), pieces: comps.filter((c) => isFabricable(c) && !isDone(c)).length };
    })
    .filter((x) => x.total > 0 || x.pieces > 0)
    .sort((a, b) => b.pending - a.pending);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Manufactura"
        description="Qué hay que fabricar, en qué máquina y cuántas horas de taller requiere. Los tiempos salen de la ficha de manufactura de cada componente."
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo pendientes
            </label>
            {workshops.length ? (
              <NativeSelect value={workshop} onChange={(e) => setWorkshop(e.target.value)} className="h-8 w-44 text-xs">
                <option value="">Todos los talleres</option>
                {workshops.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Horas de taller" value={formatHours(totalHours)} hint="todas las piezas" />
        <Stat label="Horas pendientes" value={formatHours(pendingHours)} tone={pendingHours > 0 ? 'info' : 'default'} hint="piezas no terminadas" />
        <Stat label="Pendientes de fabricar" value={components.filter((c) => c.status === 'pending_manufacturing').length} onClick={() => navigate(`/p/${project.id}/components?status=pending_manufacturing`)} />
        <Stat label="En fabricación" value={components.filter((c) => c.status === 'in_manufacturing').length} tone="info" onClick={() => navigate(`/p/${project.id}/components?status=in_manufacturing`)} />
        <Stat label="En inspección" value={components.filter((c) => c.status === 'inspection').length} tone="warning" onClick={() => navigate(`/p/${project.id}/components?status=inspection`)} />
        <Stat label="Sin datos de taller" value={missingData.length} tone={missingData.length ? 'warning' : 'default'} hint="en etapa de fabricación sin tiempos" />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Por máquina */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Por máquina / proceso</h2>
          {groups.length === 0 ? (
            <EmptyState icon={Factory} title="Sin información de manufactura" description="Registra proceso, máquina y tiempos en la ficha de cada componente fabricable (sección Manufactura)." />
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => {
                const expanded = open[g.key] ?? true;
                return (
                  <Card key={g.key}>
                    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-accent/40 rounded-t-lg" onClick={() => setOpen((o) => ({ ...o, [g.key]: !expanded }))}>
                      {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      <Wrench className="size-4 text-muted-foreground" />
                      <span className="font-medium">{g.label}</span>
                      {g.workshop ? <Badge variant="muted">{g.workshop}</Badge> : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {g.components.length} pieza(s) · <b className="text-foreground">{formatHours(g.pendingMinutes / 60)}</b> pendientes
                        {g.totalMinutes !== g.pendingMinutes ? ` · ${formatHours(g.totalMinutes / 60)} total` : ''}
                      </span>
                    </button>
                    {expanded ? (
                      <CardContent className="pt-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>Componente</TableHead>
                              <TableHead className="hidden sm:table-cell">Proceso</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead className="text-right">Tiempo</TableHead>
                              <TableHead className="hidden md:table-cell">Programada</TableHead>
                              <TableHead className="hidden lg:table-cell">Responsable</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.components
                              .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
                              .map((c) => {
                                const m = c.manufacturing!;
                                const minutes = manufacturingMinutes(m) * Math.max(1, c.quantity);
                                return (
                                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/p/${project.id}/components/${c.id}`)}>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{c.code}</span>
                                        <span className="truncate font-medium">{c.name}</span>
                                        {c.quantity > 1 ? <span className="text-xs text-muted-foreground">×{c.quantity}</span> : null}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground">
                                        {systemsById.get(c.systemId)?.name}
                                        {c.material ? ` · ${c.material}` : ''}
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-xs">{m.process ? MANUFACTURING_PROCESSES.find((p) => p.key === m.process)?.label : '—'}</TableCell>
                                    <TableCell>
                                      <StatusBadge status={c.status} />
                                    </TableCell>
                                    <TableCell className="text-right text-xs tabular">{formatHours(minutes / 60)}</TableCell>
                                    <TableCell className="hidden md:table-cell text-xs">
                                      {m.scheduledDate ? (
                                        <span className={cn(!isDone(c) && m.scheduledDate < today && 'text-red-600 font-medium')}>{formatDate(m.scheduledDate)}</span>
                                      ) : c.dueDate ? (
                                        <span className="text-muted-foreground">límite {formatDate(c.dueDate)}</span>
                                      ) : (
                                        '—'
                                      )}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                      <UserChip user={m.responsibleId ? usersById.get(m.responsibleId) : c.responsibleId ? usersById.get(c.responsibleId) : null} size="xs" className="text-xs" />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {/* Por sistema */}
          <Card>
            <CardHeader>
              <CardTitle>Horas por sistema</CardTitle>
            </CardHeader>
            <CardContent>
              {perSystem.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin tiempos registrados.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {perSystem.map(({ s, total, pending, pieces }) => (
                    <li key={s.id}>
                      <Link to={`/p/${project.id}/systems/${s.id}`} className="flex items-center justify-between text-sm hover:underline">
                        <span>
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{s.code}</span>
                          {s.name}
                        </span>
                        <span className="text-xs tabular">
                          <b>{formatHours(pending)}</b> <span className="text-muted-foreground">/ {formatHours(total)} · {pieces} pzas</span>
                        </span>
                      </Link>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${totalHours ? (pending / totalHours) * 100 : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Cola de taller */}
          <Card>
            <CardHeader>
              <CardTitle>Cola de taller</CardTitle>
              <span className="text-xs text-muted-foreground">{queue.length} piezas</span>
            </CardHeader>
            <CardContent>
              {queue.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nada pendiente de fabricar o inspeccionar.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {queue.slice(0, 12).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-xs">
                      <Link to={`/p/${project.id}/components/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        <span className="font-mono text-muted-foreground mr-1">{c.code}</span>
                        {c.name}
                      </Link>
                      <StatusBadge status={c.status} />
                      {c.dueDate ? <span className={cn('shrink-0 text-muted-foreground', data.isOverdue(c) && 'text-red-600 font-medium')}>{dueLabel(c.dueDate, today)}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {missingData.length ? (
            <Card className="border-amber-200">
              <CardHeader>
                <CardTitle className="text-amber-800">Sin datos de manufactura</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">Estas piezas están en etapa de fabricación pero no tienen proceso ni tiempos, así que no suman horas de taller.</p>
                <ul className="flex flex-col gap-1">
                  {missingData.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-xs">
                      <Link to={`/p/${project.id}/components/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        <span className="font-mono text-muted-foreground mr-1">{c.code}</span>
                        {c.name}
                      </Link>
                      {canEdit(c) ? (
                        <Button variant="outline" size="xs" onClick={() => setEditing(c)}>
                          Registrar
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      {editing ? <ManufacturingDialog open onOpenChange={(o) => !o && setEditing(null)} component={editing} /> : null}
    </div>
  );
}
