import { FilesCard } from '@/components/domain/files-card';
import { TestDialog, TestStatusBadge } from '@/components/domain/test-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Stat, UserChip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/hooks/use-project';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TEST_STATUSES, type Test, type TestStatus } from '@rdms/shared';
import { FlaskConical, Pencil, Plus, X } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router';

export function TestsPage() {
  const { project, tests, systems, systemsById, componentsById, usersById, canManageProject, canManageSystem, user } = useProject();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('test');
  const statusFilter = (params.get('status') as TestStatus | null) ?? '';
  const systemFilter = params.get('system') ?? '';
  const [editing, setEditing] = React.useState<Test | null | 'new'>(null);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filtered = tests.filter((t) => (!statusFilter || t.status === statusFilter) && (!systemFilter || t.systemId === systemFilter));
  const selected = tests.find((t) => t.id === selectedId) ?? null;
  const count = (s: TestStatus) => tests.filter((t) => t.status === s).length;
  const canEditTest = (t: Test) => canManageProject || (t.systemId ? canManageSystem(t.systemId) : false) || t.responsibleId === user.id;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Pruebas"
        description="Pruebas de componentes y sistemas: objetivo, resultado y evidencia adjunta."
        actions={
          <>
            <NativeSelect value={systemFilter} onChange={(e) => update('system', e.target.value || null)} className="h-8 w-44 text-xs">
              <option value="">Todos los sistemas</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </NativeSelect>
            <Button onClick={() => setEditing('new')}>
              <Plus /> Nueva prueba
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TEST_STATUSES.map((s) => (
          <Stat key={s.key} label={s.label} value={count(s.key)} tone={s.key === 'failed' && count('failed') ? 'danger' : s.key === 'passed' ? 'success' : 'default'} onClick={() => update('status', statusFilter === s.key ? null : s.key)} className={cn(statusFilter === s.key && 'ring-2 ring-primary/40')} />
        ))}
      </section>

      <div className={cn('grid gap-5', selected && 'lg:grid-cols-3')}>
        <div className={cn(selected && 'lg:col-span-2')}>
          {filtered.length === 0 ? (
            <EmptyState icon={FlaskConical} title={tests.length ? 'Sin pruebas con estos filtros' : 'Todavía no hay pruebas'} description="Planifica pruebas estructurales, funcionales, de eyección o estáticas y registra su resultado." action={<Button onClick={() => setEditing('new')}><Plus /> Nueva prueba</Button>} />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Prueba</TableHead>
                    <TableHead className="hidden md:table-cell">Alcance</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                    <TableHead className="hidden lg:table-cell">Responsable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const comp = t.componentId ? componentsById.get(t.componentId) : null;
                    const sys = t.systemId ? systemsById.get(t.systemId) : null;
                    return (
                      <TableRow key={t.id} className={cn('cursor-pointer', selected?.id === t.id && 'bg-accent/50')} onClick={() => update('test', selected?.id === t.id ? null : t.id)}>
                        <TableCell>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-[11px] text-muted-foreground">{t.type ?? 'Sin tipo'}{t.objective ? ` · ${t.objective.slice(0, 80)}${t.objective.length > 80 ? '…' : ''}` : ''}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs">
                          {comp ? (
                            <span>
                              <span className="font-mono text-muted-foreground">{comp.code}</span> {comp.name}
                            </span>
                          ) : sys ? (
                            <span>{sys.name}</span>
                          ) : (
                            <span className="text-muted-foreground">Proyecto</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <TestStatusBadge status={t.status} />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{formatDate(t.date)}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <UserChip user={t.responsibleId ? usersById.get(t.responsibleId) : null} size="xs" className="text-xs" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {selected ? (
          <Card className="h-fit">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="truncate">{selected.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.type ?? 'Sin tipo'} · {formatDate(selected.date)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {canEditTest(selected) ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditing(selected)}>
                    <Pencil />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={() => update('test', null)}>
                  <X />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <TestStatusBadge status={selected.status} />
                <UserChip user={selected.responsibleId ? usersById.get(selected.responsibleId) : null} size="xs" className="text-xs" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Alcance</p>
                <p className="text-xs">
                  {selected.componentId && componentsById.get(selected.componentId) ? (
                    <Link to={`/p/${project.id}/components/${selected.componentId}`} className="hover:underline">
                      <span className="font-mono text-muted-foreground">{componentsById.get(selected.componentId)!.code}</span> {componentsById.get(selected.componentId)!.name}
                    </Link>
                  ) : selected.systemId ? (
                    systemsById.get(selected.systemId)?.name
                  ) : (
                    'Proyecto completo'
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Objetivo</p>
                <p className="whitespace-pre-wrap text-xs">{selected.objective ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resultado</p>
                <p className={cn('whitespace-pre-wrap text-xs', selected.status === 'failed' && 'text-red-700')}>{selected.result ?? '—'}</p>
              </div>
              {selected.observations ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Observaciones</p>
                  <p className="whitespace-pre-wrap text-xs">{selected.observations}</p>
                </div>
              ) : null}
              <FilesCard entityType="test" entityId={selected.id} canEdit={canEditTest(selected)} title="Evidencia" defaultCategory="test_result" compact />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <TestDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} test={editing === 'new' ? null : editing} defaultSystemId={systemFilter || undefined} />
    </div>
  );
}
