import { ActivityFeed } from '@/components/domain/activity-feed';
import { BlockedBadge, DueSoonBadge, OverdueBadge, PriorityBadge, StatusBadge } from '@/components/domain/badges';
import { ComponentFormDialog } from '@/components/domain/component-form';
import { FilesCard } from '@/components/domain/files-card';
import { InspectionDialog, InspectionResultBadge } from '@/components/domain/inspection-dialog';
import { ManufacturingDialog } from '@/components/domain/manufacturing-form';
import { ComponentPicker, UserPicker } from '@/components/domain/pickers';
import { PurchaseDialog, PurchaseStatusBadge } from '@/components/domain/purchase-form';
import { StatusChanger } from '@/components/domain/status-changer';
import { TestDialog, TestStatusBadge } from '@/components/domain/test-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, EmptyState, UserChip } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { dueLabel, formatDate, formatDateTime, formatHours, formatMoney, formatNumber } from '@/lib/format';
import { useCollaboratorMutation, useComponentActivity, useDeleteComponent, useDependencyMutation, useUpdateComponent } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { componentRealCost, COST_CATEGORIES, estimatedCost, isDone, MANUFACTURING_PROCESSES, manufacturingMinutes, MATERIAL_STATUSES, purchaseArrival, purchaseTotal, STATUS_BY_KEY, statusOrder, type Component, type Purchase, type Test } from '@rdms/shared';
import { ArrowLeft, Ban, ClipboardCheck, Factory, FlaskConical, GitFork, Link2, MoreHorizontal, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

export function ComponentDetailPage() {
  const { componentId = '' } = useParams();
  const data = useProject();
  const { project, componentsById, systemsById, usersById, members, blocking, canEdit, canManageSystem, isOverdue, isDueSoon, today, purchases, tests, inspections } = data;
  const navigate = useNavigate();
  const component = componentsById.get(componentId);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editSection, setEditSection] = React.useState<'general' | 'material' | 'costs'>('general');
  const [manufOpen, setManufOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [inspectOpen, setInspectOpen] = React.useState(false);
  const [purchaseOpen, setPurchaseOpen] = React.useState<Purchase | null | 'new'>(null);
  const [testOpen, setTestOpen] = React.useState<Test | null | 'new'>(null);

  const activity = useComponentActivity(project.id, componentId);
  const update = useUpdateComponent(project.id);
  const deps = useDependencyMutation(project.id);
  const collabs = useCollaboratorMutation(project.id);
  const del = useDeleteComponent(project.id, { onSuccess: () => navigate(`/p/${project.id}/components`) });

  if (!component) {
    return (
      <EmptyState
        icon={Ban}
        title="Componente no encontrado"
        description="Puede que haya sido eliminado o que pertenezca a otro proyecto."
        action={
          <Button variant="outline" asChild>
            <Link to={`/p/${project.id}/components`}>Volver a componentes</Link>
          </Button>
        }
      />
    );
  }

  const editable = canEdit(component);
  const manage = canManageSystem(component.systemId);
  const system = systemsById.get(component.systemId);
  const responsible = component.responsibleId ? usersById.get(component.responsibleId) : null;
  const designer = component.designerId ? usersById.get(component.designerId) : null;
  const block = blocking.get(component.id);
  const overdue = isOverdue(component);
  const soon = isDueSoon(component);
  const done = isDone(component);
  const est = estimatedCost(component);
  const dependsOn = component.dependsOn.map((id) => componentsById.get(id)).filter((c): c is Component => !!c);
  const dependents = component.dependents.map((id) => componentsById.get(id)).filter((c): c is Component => !!c);
  const m = component.manufacturing;
  const manufMinutes = manufacturingMinutes(m);
  const linkedPurchases = purchases.filter((p) => p.componentIds.includes(component.id));
  const linkedTests = tests.filter((t) => t.componentId === component.id);
  const componentInspections = inspections.filter((i) => i.componentId === component.id);
  const realCost = componentRealCost(component, purchases);
  const canInspect = !done || component.status === 'completed';

  const openEdit = (section: 'general' | 'material' | 'costs') => {
    setEditSection(section);
    setEditOpen(true);
  };

  const patch = (input: Parameters<typeof update.mutate>[0]['input'], okMsg?: string) =>
    update.mutate({ id: component.id, input }, { onSuccess: () => okMsg && toast.success(okMsg), onError: (err) => toast.error(err.message) });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link to={`/p/${project.id}/components`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Componentes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{component.code}</span>
              <Link to={`/p/${project.id}/systems/${component.systemId}`} className="text-xs text-muted-foreground hover:underline">
                {system?.name}
              </Link>
              {component.subsystem ? <span className="text-xs text-muted-foreground">· {component.subsystem}</span> : null}
            </div>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{component.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusChanger component={component} size="default" />
              <PriorityBadge priority={component.priority} />
              {block && block.blockedBy.length ? <BlockedBadge /> : null}
              {overdue ? <OverdueBadge label={dueLabel(component.dueDate, today)} /> : soon ? <DueSoonBadge label={dueLabel(component.dueDate, today)} /> : null}
              {block && block.blocking.length ? (
                <Badge variant="danger">
                  <GitFork /> bloquea {block.blocking.length}
                </Badge>
              ) : null}
              {component.quantity > 1 ? <Badge variant="muted">×{component.quantity}</Badge> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canInspect ? (
              <Button variant={component.status === 'inspection' ? 'default' : 'outline'} onClick={() => setInspectOpen(true)}>
                <ClipboardCheck /> Inspeccionar
              </Button>
            ) : null}
            {editable ? (
              <Button variant="outline" onClick={() => openEdit('general')}>
                <Pencil /> Editar
              </Button>
            ) : null}
            {manage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Más acciones">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                    <Trash2 /> Eliminar componente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {block && block.blockedBy.length ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <b>Bloqueado por:</b>{' '}
            {block.blockedBy.map((id, i) => {
              const d = componentsById.get(id);
              return d ? (
                <React.Fragment key={id}>
                  {i > 0 ? ', ' : ''}
                  <Link to={`/p/${project.id}/components/${id}`} className="underline">
                    {d.name}
                  </Link>{' '}
                  <span className="opacity-70">({d.code} · {statusLabel(d)})</span>
                </React.Fragment>
              ) : null;
            })}
            . Estos componentes van en una etapa anterior a este.
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Resumen */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
              {editable ? (
                <Button variant="ghost" size="xs" onClick={() => openEdit('general')}>
                  <Pencil /> Editar
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Row label="Responsable">
                  {manage ? (
                    <UserPicker users={members} value={component.responsibleId} onChange={(id) => patch({ responsibleId: id }, 'Responsable actualizado')} size="sm" className="h-8 -ml-2 w-auto max-w-full border-transparent shadow-none hover:border-border" />
                  ) : (
                    <UserChip user={responsible} />
                  )}
                </Row>
                <Row label="Colaboradores">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {component.collaboratorIds.map((id) => {
                      const u = usersById.get(id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-0.5 pr-1.5 text-xs">
                          <Avatar user={u} size="xs" />
                          {u?.name ?? '?'}
                          {editable ? (
                            <button type="button" className="ml-0.5 rounded-full p-0.5 hover:bg-muted cursor-pointer" aria-label="Quitar" onClick={() => collabs.mutate({ id: component.id, userId: id, add: false }, { onError: (e) => toast.error(e.message) })}>
                              <X className="size-3" />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                    {editable ? (
                      <UserPickerButton
                        users={members.filter((u) => u.id !== component.responsibleId && !component.collaboratorIds.includes(u.id))}
                        onPick={(id) => collabs.mutate({ id: component.id, userId: id, add: true }, { onError: (e) => toast.error(e.message) })}
                      />
                    ) : component.collaboratorIds.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : null}
                  </div>
                </Row>
                <Row label="Fecha de inicio">{formatDate(component.startDate)}</Row>
                <Row label="Fecha límite">
                  <span className={cn(overdue && 'text-red-600 font-medium', soon && 'text-amber-600 font-medium')}>
                    {formatDate(component.dueDate)}
                    {component.dueDate && !done ? <span className="ml-1 text-xs font-normal text-muted-foreground">({dueLabel(component.dueDate, today)})</span> : null}
                  </span>
                </Row>
                <Row label="Completado">{component.completedAt ? formatDateTime(component.completedAt) : '—'}</Row>
                <Row label="Creado">{formatDate(component.createdAt)}</Row>
                <Row label="Descripción" className="sm:col-span-2">
                  {component.description ? <p className="whitespace-pre-wrap">{component.description}</p> : <span className="text-muted-foreground">—</span>}
                </Row>
              </dl>
            </CardContent>
          </Card>

          {/* Material y costos */}
          <Card>
            <CardHeader>
              <CardTitle>Material y costos</CardTitle>
              {editable ? (
                <Button variant="ghost" size="xs" onClick={() => openEdit('material')}>
                  <Pencil /> Editar
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <dl className="grid gap-3">
                <Row label="Material">{component.material ?? <span className="text-muted-foreground">—</span>}</Row>
                <Row label="Cantidad de material">
                  {component.materialQty != null ? `${formatNumber(component.materialQty, 3)} ${component.materialUnit ?? ''}` : <span className="text-muted-foreground">—</span>}
                </Row>
                <Row label="Proveedor">{component.supplier ?? <span className="text-muted-foreground">—</span>}</Row>
                <Row label="Disponibilidad">
                  {component.materialStatus ? (
                    <Badge variant={component.materialStatus === 'available' ? 'success' : component.materialStatus === 'ordered' ? 'info' : 'warning'}>
                      {MATERIAL_STATUSES.find((s) => s.key === component.materialStatus)?.label}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Row>
              </dl>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <table className="w-full text-xs">
                  <tbody>
                    {COST_CATEGORIES.map((cat) => (
                      <CostRow key={cat.key} label={cat.label} value={component[cat.key]} currency={project.currency} />
                    ))}
                    <tr className="border-t">
                      <td className="pt-2 font-medium">Estimado total</td>
                      <td className="pt-2 text-right font-semibold tabular">{formatMoney(est, project.currency)}</td>
                    </tr>
                    <tr>
                      <td className="pt-1 font-medium">
                        Costo real
                        {component.actualCost == null && realCost != null ? <span className="ml-1 font-normal text-muted-foreground">(compras recibidas)</span> : null}
                      </td>
                      <td className={cn('pt-1 text-right font-semibold tabular', realCost != null && realCost > est && est > 0 && 'text-red-600')}>{formatMoney(realCost, project.currency)}</td>
                    </tr>
                    {realCost != null && est > 0 ? (
                      <tr>
                        <td className="pt-1 text-muted-foreground">Variación</td>
                        <td className={cn('pt-1 text-right tabular', realCost > est ? 'text-red-600' : 'text-emerald-600')}>
                          {realCost >= est ? '+' : ''}
                          {Math.round(((realCost - est) / est) * 100)}%
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Manufactura */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="size-4 text-muted-foreground" /> Manufactura
              </CardTitle>
              {editable ? (
                <Button variant="ghost" size="xs" onClick={() => setManufOpen(true)}>
                  <Pencil /> {m ? 'Editar' : 'Registrar'}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {m ? (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                  <Row label="Proceso">{m.process ? MANUFACTURING_PROCESSES.find((p) => p.key === m.process)?.label : '—'}</Row>
                  <Row label="Máquina">{m.machine ?? '—'}</Row>
                  <Row label="Taller">{m.workshop ?? '—'}</Row>
                  <Row label="Tiempo por unidad">
                    {formatHours(manufMinutes / 60)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (prep {m.setupMinutes} · maq {m.machineMinutes} · acab {m.finishingMinutes} · insp {m.inspectionMinutes} min)
                    </span>
                  </Row>
                  <Row label="Tiempo total">
                    {formatHours((manufMinutes * component.quantity) / 60)}
                    {component.quantity > 1 ? <span className="ml-1 text-xs text-muted-foreground">×{component.quantity}</span> : null}
                  </Row>
                  <Row label="Responsable">
                    <UserChip user={m.responsibleId ? usersById.get(m.responsibleId) : null} size="xs" />
                  </Row>
                  <Row label="Programada">{formatDate(m.scheduledDate)}</Row>
                  <Row label="Fecha real">{formatDate(m.actualDate)}</Row>
                  <Row label="Requiere">
                    <span className="flex flex-wrap gap-1">
                      {m.needsWorkshop ? <Badge variant="slate">Taller</Badge> : null}
                      {m.needsExternal ? <Badge variant="orange">Proveedor externo</Badge> : null}
                      {!m.needsWorkshop && !m.needsExternal ? '—' : null}
                    </span>
                  </Row>
                  {m.notes ? (
                    <Row label="Notas" className="sm:col-span-3">
                      <p className="whitespace-pre-wrap">{m.notes}</p>
                    </Row>
                  ) : null}
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">Sin información de manufactura. {editable ? 'Regístrala si esta pieza se fabrica en el taller.' : ''}</p>
              )}
            </CardContent>
          </Card>

          <FilesCard entityType="component" entityId={component.id} canEdit={editable} description="Planos, CAD, datasheets, fotos y documentos de fabricación de este componente." />

          {/* Compras */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-muted-foreground" /> Compras
                {linkedPurchases.length && linkedPurchases.some((p) => purchaseTotal(p) > 0) ? <span className="text-xs font-normal text-muted-foreground">{formatMoney(linkedPurchases.reduce((a, p) => a + purchaseTotal(p), 0), project.currency)}</span> : null}
              </CardTitle>
              <Button variant="ghost" size="xs" onClick={() => setPurchaseOpen('new')}>
                <Plus /> Nueva compra
              </Button>
            </CardHeader>
            <CardContent>
              {linkedPurchases.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin compras asociadas. Registra aquí lo que haya que comprar para esta pieza; el sistema avisará si la entrega choca con la fecha límite.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {linkedPurchases.map((p) => {
                    const arrival = purchaseArrival(p, today);
                    const late = !!arrival && !!component.dueDate && !done && p.status !== 'received' && arrival > component.dueDate;
                    return (
                      <li key={p.id} className={cn('flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs', late && 'border-red-200 bg-red-50')}>
                        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline cursor-pointer" onClick={() => setPurchaseOpen(p)}>
                          {p.name}
                        </button>
                        <span className="text-muted-foreground">{p.supplier}</span>
                        <PurchaseStatusBadge status={p.status} />
                        <span className="tabular">{formatMoney(purchaseTotal(p), project.currency)}</span>
                        {arrival && p.status !== 'received' ? <span className={cn('text-muted-foreground', late && 'font-medium text-red-700')}>llega {formatDate(arrival)}</span> : null}
                        {p.status === 'received' ? <span className="text-muted-foreground">recibido {formatDate(p.receivedAt)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Pruebas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="size-4 text-muted-foreground" /> Pruebas
              </CardTitle>
              <Button variant="ghost" size="xs" onClick={() => setTestOpen('new')}>
                <Plus /> Nueva prueba
              </Button>
            </CardHeader>
            <CardContent>
              {linkedTests.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin pruebas registradas para este componente.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {linkedTests.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <Link to={`/p/${project.id}/tests?test=${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                        {t.name}
                      </Link>
                      {t.type ? <span className="text-muted-foreground">{t.type}</span> : null}
                      <TestStatusBadge status={t.status} />
                      <span className="text-muted-foreground">{formatDate(t.date)}</span>
                      <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" onClick={() => setTestOpen(t)} aria-label="Editar prueba">
                        <Pencil className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Dependencias */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" /> Dependencias
              </CardTitle>
              {editable ? (
                <ComponentPicker
                  components={data.components}
                  exclude={new Set([component.id, ...component.dependsOn])}
                  systemsById={systemsById}
                  onSelect={(c) => deps.mutate({ id: component.id, dependsOnId: c.id, add: true }, { onError: (e) => toast.error(e.message) })}
                  trigger={
                    <Button variant="ghost" size="xs">
                      <Plus /> Agregar dependencia
                    </Button>
                  }
                />
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Depende de ({dependsOn.length})</p>
                {dependsOn.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Este componente no depende de otros.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {dependsOn.map((d) => {
                      const lagging = !isDone(d) && statusOrder(d.status) < statusOrder(component.status);
                      return (
                        <DepItem key={d.id} c={d} projectId={project.id} tag={isDone(d) ? 'ok' : lagging ? 'blocking' : 'waiting'} onRemove={editable ? () => deps.mutate({ id: component.id, dependsOnId: d.id, add: false }, { onError: (e) => toast.error(e.message) }) : undefined} />
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dependen de este ({dependents.length})</p>
                {dependents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ningún componente depende de este.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {dependents.map((d) => (
                      <DepItem key={d.id} c={d} projectId={project.id} tag={isDone(d) ? 'ok' : block?.blocking.includes(d.id) ? 'blocked' : 'none'} />
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Diseño</CardTitle>
              {editable ? (
                <Button variant="ghost" size="xs" onClick={() => openEdit('costs')}>
                  <Pencil /> Editar
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <Row label="Diseñador">
                  <UserChip user={designer} size="xs" />
                </Row>
                <Row label="Diseño aprobado">{component.designApprovedAt ? formatDate(component.designApprovedAt) : <span className="text-muted-foreground">pendiente</span>}</Row>
                <Row label="Notas">{component.designNotes ? <p className="whitespace-pre-wrap text-xs">{component.designNotes}</p> : <span className="text-muted-foreground">—</span>}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-muted-foreground" /> Inspecciones
              </CardTitle>
              {canInspect ? (
                <Button variant="ghost" size="xs" onClick={() => setInspectOpen(true)}>
                  <Plus /> Registrar
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {componentInspections.length === 0 ? (
                <p className="text-xs text-muted-foreground">{component.status === 'inspection' ? 'Esta pieza espera inspección: registra el resultado y el estado se actualizará solo.' : 'Sin inspecciones registradas.'}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {componentInspections.map((i) => (
                    <li key={i.id} className="rounded-md border px-2.5 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <InspectionResultBadge result={i.result} />
                        <span className="text-muted-foreground">
                          {formatDate(i.date)} · {i.inspectorId ? (usersById.get(i.inspectorId)?.name ?? '—') : '—'}
                        </span>
                      </div>
                      {i.observations ? <p className="mt-1 text-muted-foreground">{i.observations}</p> : null}
                      <div className="mt-1.5">
                        <FilesCard entityType="inspection" entityId={i.id} canEdit={editable || i.inspectorId === data.user.id} title="Fotos" defaultCategory="photo" compact />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed logs={activity.data ?? []} compact showEntityLinks={false} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ComponentFormDialog open={editOpen} onOpenChange={setEditOpen} component={component} section={editSection} />
      <ManufacturingDialog open={manufOpen} onOpenChange={setManufOpen} component={component} />
      <InspectionDialog open={inspectOpen} onOpenChange={setInspectOpen} component={component} />
      <PurchaseDialog open={purchaseOpen !== null} onOpenChange={(o) => !o && setPurchaseOpen(null)} purchase={purchaseOpen === 'new' ? null : purchaseOpen} defaultComponentIds={[component.id]} />
      <TestDialog open={testOpen !== null} onOpenChange={(o) => !o && setTestOpen(null)} test={testOpen === 'new' ? null : testOpen} defaultComponentId={component.id} defaultSystemId={component.systemId} />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar {component.code}?</DialogTitle>
            <DialogDescription>
              Se eliminará «{component.name}» junto con sus dependencias y datos de manufactura. El historial del proyecto conservará el registro de su eliminación.
              {dependents.length ? ` ${dependents.length} componente(s) dependen de este.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate(component.id, { onError: (e) => toast.error(e.message), onSuccess: () => toast.success('Componente eliminado') })}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusLabel(c: Component) {
  return STATUS_BY_KEY[c.status].label.toLowerCase();
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function CostRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <tr>
      <td className="py-0.5 text-muted-foreground">{label}</td>
      <td className={cn('py-0.5 text-right tabular', value === 0 && 'text-muted-foreground/60')}>{formatMoney(value, currency)}</td>
    </tr>
  );
}

function DepItem({ c, projectId, tag, onRemove }: { c: Component; projectId: string; tag: 'ok' | 'blocking' | 'waiting' | 'blocked' | 'none'; onRemove?: () => void }) {
  return (
    <li className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs', tag === 'blocking' && 'border-red-200 bg-red-50', tag === 'blocked' && 'border-red-200 bg-red-50')}>
      <Link to={`/p/${projectId}/components/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
        <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">{c.code}</span>
        <span className="truncate">{c.name}</span>
      </Link>
      <StatusBadge status={c.status} className="shrink-0" />
      {tag === 'blocking' ? <span className="text-[10px] font-medium text-red-700">te bloquea</span> : null}
      {tag === 'waiting' ? <span className="text-[10px] text-muted-foreground">esperando</span> : null}
      {tag === 'blocked' ? <span className="text-[10px] font-medium text-red-700">bloqueado</span> : null}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" aria-label="Quitar dependencia">
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}

function UserPickerButton({ users, onPick }: { users: { id: string; name: string; email: string; avatarUrl: string | null; isActive: boolean }[]; onPick: (id: string) => void }) {
  const [value, setValue] = React.useState<string | null>(null);
  return (
    <UserPicker
      users={users}
      value={value}
      onChange={(id) => {
        if (id) {
          onPick(id);
          setValue(null);
        }
      }}
      allowClear={false}
      size="sm"
      placeholder="Agregar"
      className="h-7 rounded-full px-2 text-xs"
    />
  );
}
