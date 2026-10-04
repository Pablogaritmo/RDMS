import { UserPicker } from '@/components/domain/pickers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { useCreateComponent, useUpdateComponent } from '@/lib/queries';
import { numOrNull, strOrNull } from '@/lib/utils';
import { COMPONENT_STATUSES, MATERIAL_STATUSES, PRIORITIES, type Component, type ComponentStatus, type CreateComponentInput, type MaterialStatus, type Priority, type UpdateComponentInput } from '@rdms/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

interface FormState {
  name: string;
  systemId: string;
  responsibleId: string | null;
  priority: Priority;
  status: ComponentStatus;
  startDate: string;
  dueDate: string;
  quantity: string;
  description: string;
  subsystem: string;
  code: string;
  material: string;
  materialQty: string;
  materialUnit: string;
  supplier: string;
  materialStatus: MaterialStatus | '';
  designerId: string | null;
  designNotes: string;
  estMaterialCost: string;
  estManufacturingCost: string;
  estPurchaseCost: string;
  estOtherCost: string;
  actualCost: string;
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function fromComponent(c: Component | null, defaults: { systemId?: string; responsibleId?: string | null }): FormState {
  return {
    name: c?.name ?? '',
    systemId: c?.systemId ?? defaults.systemId ?? '',
    responsibleId: c ? c.responsibleId : (defaults.responsibleId ?? null),
    priority: c?.priority ?? 'medium',
    status: c?.status ?? 'idea',
    startDate: c?.startDate ?? '',
    dueDate: c?.dueDate ?? '',
    quantity: String(c?.quantity ?? 1),
    description: c?.description ?? '',
    subsystem: c?.subsystem ?? '',
    code: c?.code ?? '',
    material: c?.material ?? '',
    materialQty: num(c?.materialQty),
    materialUnit: c?.materialUnit ?? '',
    supplier: c?.supplier ?? '',
    materialStatus: c?.materialStatus ?? '',
    designerId: c?.designerId ?? null,
    designNotes: c?.designNotes ?? '',
    estMaterialCost: num(c?.estMaterialCost ?? 0) === '0' ? '' : num(c?.estMaterialCost),
    estManufacturingCost: num(c?.estManufacturingCost ?? 0) === '0' ? '' : num(c?.estManufacturingCost),
    estPurchaseCost: num(c?.estPurchaseCost ?? 0) === '0' ? '' : num(c?.estPurchaseCost),
    estOtherCost: num(c?.estOtherCost ?? 0) === '0' ? '' : num(c?.estOtherCost),
    actualCost: num(c?.actualCost),
  };
}

export interface ComponentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** existing component → edit mode */
  component?: Component | null;
  defaultSystemId?: string;
  /** which section to expand by default in edit mode */
  section?: 'general' | 'material' | 'costs';
}

export function ComponentFormDialog({ open, onOpenChange, component = null, defaultSystemId, section }: ComponentFormDialogProps) {
  const { project, systems, members, user, canManageSystem, canCreateIn } = useProject();
  const navigate = useNavigate();
  const isEdit = !!component;
  const [form, setForm] = React.useState<FormState>(() => fromComponent(component, { systemId: defaultSystemId, responsibleId: user.id }));
  const [more, setMore] = React.useState(!!section && section !== 'general');

  React.useEffect(() => {
    if (open) {
      const creatableSystems = systems.filter((s) => canCreateIn(s.id));
      const sysId = component?.systemId ?? defaultSystemId ?? creatableSystems[0]?.id ?? systems[0]?.id ?? '';
      setForm(fromComponent(component, { systemId: sysId, responsibleId: user.id }));
      setMore(!!section && section !== 'general');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, component?.id]);

  const create = useCreateComponent(project.id);
  const update = useUpdateComponent(project.id);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canAssign = form.systemId ? canManageSystem(form.systemId) : false;
  const selectableSystems = isEdit ? systems : systems.filter((s) => canCreateIn(s.id));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('El nombre es obligatorio');
    if (!form.systemId) return toast.error('Selecciona un sistema');

    const base: UpdateComponentInput = {
      name: form.name.trim(),
      systemId: form.systemId,
      priority: form.priority,
      startDate: strOrNull(form.startDate),
      dueDate: strOrNull(form.dueDate),
      quantity: Math.max(1, Math.round(numOrNull(form.quantity) ?? 1)),
      description: strOrNull(form.description),
      subsystem: strOrNull(form.subsystem),
      material: strOrNull(form.material),
      materialQty: numOrNull(form.materialQty),
      materialUnit: strOrNull(form.materialUnit),
      supplier: strOrNull(form.supplier),
      materialStatus: form.materialStatus || null,
      designerId: form.designerId,
      designNotes: strOrNull(form.designNotes),
      estMaterialCost: numOrNull(form.estMaterialCost) ?? 0,
      estManufacturingCost: numOrNull(form.estManufacturingCost) ?? 0,
      estPurchaseCost: numOrNull(form.estPurchaseCost) ?? 0,
      estOtherCost: numOrNull(form.estOtherCost) ?? 0,
      actualCost: numOrNull(form.actualCost),
    };
    if (canAssign || !isEdit) base.responsibleId = form.responsibleId;
    if (isEdit && canAssign && form.code.trim() && form.code.trim() !== component.code) base.code = form.code.trim();

    if (isEdit) {
      // only send changed fields
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) {
        const prev = (component as unknown as Record<string, unknown>)[k];
        if (JSON.stringify(prev ?? null) !== JSON.stringify(v ?? null)) patch[k] = v;
      }
      if (Object.keys(patch).length === 0) return onOpenChange(false);
      update.mutate(
        { id: component.id, input: patch as UpdateComponentInput },
        {
          onSuccess: () => {
            toast.success('Componente actualizado');
            onOpenChange(false);
          },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      const input: CreateComponentInput = { ...(base as CreateComponentInput), status: form.status, collaboratorIds: [], dependsOn: [] };
      create.mutate(input, {
        onSuccess: (c) => {
          toast.success(`${c.code} creado`);
          onOpenChange(false);
          navigate(`/p/${project.id}/components/${c.id}`);
        },
        onError: (err) => toast.error(err.message),
      });
    }
  };

  const pending = create.isPending || update.isPending;
  const currency = project.currency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Editar ${component.code}` : 'Nuevo componente'}</DialogTitle>
            <DialogDescription>{isEdit ? 'Solo se guardan los campos que cambies.' : 'Lo esencial primero; el resto se puede completar después desde la ficha del componente.'}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Bulkhead inferior" autoFocus={!isEdit} required />
            </Field>
            <Field label="Sistema">
              <NativeSelect value={form.systemId} onChange={(e) => set('systemId', e.target.value)} required>
                {!form.systemId ? <option value="">Seleccionar…</option> : null}
                {selectableSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Responsable" hint={!canAssign && !isEdit ? 'Serás el responsable; un líder puede reasignarlo.' : undefined}>
              <UserPicker users={members} value={form.responsibleId} onChange={(id) => set('responsibleId', id)} disabled={!canAssign} />
            </Field>
            <Field label="Prioridad">
              <NativeSelect value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {!isEdit ? (
              <Field label="Estado inicial">
                <NativeSelect value={form.status} onChange={(e) => set('status', e.target.value as ComponentStatus)}>
                  {COMPONENT_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <Field label="Cantidad">
                <Input type="number" min={1} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              </Field>
            )}
            <Field label="Fecha de inicio">
              <Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="Fecha límite">
              <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Función, requisitos clave, notas…" rows={2} />
            </Field>
          </div>

          <button type="button" onClick={() => setMore((m) => !m)} className="inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
            {more ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {more ? 'Menos campos' : 'Más campos: material, costos, diseño'}
          </button>

          {more ? (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
              {!isEdit ? (
                <Field label="Cantidad">
                  <Input type="number" min={1} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
                </Field>
              ) : null}
              <Field label="Subsistema">
                <Input value={form.subsystem} onChange={(e) => set('subsystem', e.target.value)} placeholder="Opcional" />
              </Field>
              {isEdit && canAssign ? (
                <Field label="Código" hint="Se genera automáticamente; cámbialo solo si hace falta.">
                  <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} className="font-mono" />
                </Field>
              ) : null}

              <p className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Material</p>
              <Field label="Material">
                <Input value={form.material} onChange={(e) => set('material', e.target.value)} placeholder="Ej: Aluminio 6061-T6" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cantidad">
                  <Input type="number" min={0} step="any" value={form.materialQty} onChange={(e) => set('materialQty', e.target.value)} />
                </Field>
                <Field label="Unidad">
                  <Input value={form.materialUnit} onChange={(e) => set('materialUnit', e.target.value)} placeholder="kg, m, ud" />
                </Field>
              </div>
              <Field label="Proveedor">
                <Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} />
              </Field>
              <Field label="Disponibilidad">
                <NativeSelect value={form.materialStatus} onChange={(e) => set('materialStatus', e.target.value as MaterialStatus | '')}>
                  <option value="">—</option>
                  {MATERIAL_STATUSES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <p className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Costos estimados ({currency})</p>
              <Field label="Material">
                <Input type="number" min={0} step="any" value={form.estMaterialCost} onChange={(e) => set('estMaterialCost', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Manufactura">
                <Input type="number" min={0} step="any" value={form.estManufacturingCost} onChange={(e) => set('estManufacturingCost', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Compra">
                <Input type="number" min={0} step="any" value={form.estPurchaseCost} onChange={(e) => set('estPurchaseCost', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Otros">
                <Input type="number" min={0} step="any" value={form.estOtherCost} onChange={(e) => set('estOtherCost', e.target.value)} placeholder="0" />
              </Field>
              <Field label={`Costo real (${currency})`} hint="Déjalo vacío hasta conocerlo." className="sm:col-span-2">
                <Input type="number" min={0} step="any" value={form.actualCost} onChange={(e) => set('actualCost', e.target.value)} />
              </Field>

              <p className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Diseño</p>
              <Field label="Diseñador">
                <UserPicker users={members} value={form.designerId} onChange={(id) => set('designerId', id)} />
              </Field>
              <Field label="Notas de diseño" className="sm:col-span-2">
                <Textarea value={form.designNotes} onChange={(e) => set('designNotes', e.target.value)} rows={2} />
              </Field>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              {isEdit ? 'Guardar cambios' : 'Crear componente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
