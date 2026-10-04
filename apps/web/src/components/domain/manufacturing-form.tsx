import { UserPicker } from '@/components/domain/pickers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { formatHours } from '@/lib/format';
import { useUpsertManufacturing } from '@/lib/queries';
import { numOrNull, strOrNull } from '@/lib/utils';
import { MANUFACTURING_PROCESSES, type Component, type ManufacturingInput, type ManufacturingProcess } from '@rdms/shared';
import * as React from 'react';
import { toast } from 'sonner';

interface State {
  process: ManufacturingProcess | '';
  machine: string;
  workshop: string;
  setupMinutes: string;
  machineMinutes: string;
  finishingMinutes: string;
  inspectionMinutes: string;
  responsibleId: string | null;
  scheduledDate: string;
  actualDate: string;
  needsWorkshop: boolean;
  needsExternal: boolean;
  notes: string;
}

function fromComponent(c: Component): State {
  const m = c.manufacturing;
  return {
    process: m?.process ?? '',
    machine: m?.machine ?? '',
    workshop: m?.workshop ?? '',
    setupMinutes: m?.setupMinutes ? String(m.setupMinutes) : '',
    machineMinutes: m?.machineMinutes ? String(m.machineMinutes) : '',
    finishingMinutes: m?.finishingMinutes ? String(m.finishingMinutes) : '',
    inspectionMinutes: m?.inspectionMinutes ? String(m.inspectionMinutes) : '',
    responsibleId: m?.responsibleId ?? c.responsibleId,
    scheduledDate: m?.scheduledDate ?? '',
    actualDate: m?.actualDate ?? '',
    needsWorkshop: m?.needsWorkshop ?? true,
    needsExternal: m?.needsExternal ?? false,
    notes: m?.notes ?? '',
  };
}

export function ManufacturingDialog({ open, onOpenChange, component }: { open: boolean; onOpenChange: (o: boolean) => void; component: Component }) {
  const { project, members } = useProject();
  const [form, setForm] = React.useState<State>(() => fromComponent(component));
  const mutation = useUpsertManufacturing(project.id);
  const set = <K extends keyof State>(k: K, v: State[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (open) setForm(fromComponent(component));
  }, [open, component]);

  const totalMin = ['setupMinutes', 'machineMinutes', 'finishingMinutes', 'inspectionMinutes'].reduce((acc, k) => acc + (numOrNull(form[k as keyof State] as string) ?? 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: ManufacturingInput = {
      process: form.process || null,
      machine: strOrNull(form.machine),
      workshop: strOrNull(form.workshop),
      setupMinutes: Math.round(numOrNull(form.setupMinutes) ?? 0),
      machineMinutes: Math.round(numOrNull(form.machineMinutes) ?? 0),
      finishingMinutes: Math.round(numOrNull(form.finishingMinutes) ?? 0),
      inspectionMinutes: Math.round(numOrNull(form.inspectionMinutes) ?? 0),
      responsibleId: form.responsibleId,
      scheduledDate: strOrNull(form.scheduledDate),
      actualDate: strOrNull(form.actualDate),
      needsWorkshop: form.needsWorkshop,
      needsExternal: form.needsExternal,
      notes: strOrNull(form.notes),
    };
    mutation.mutate(
      { id: component.id, input },
      {
        onSuccess: () => {
          toast.success('Manufactura actualizada');
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Manufactura · {component.code}</DialogTitle>
            <DialogDescription>Los tiempos alimentan las horas de taller del sistema y del proyecto. Se multiplican por la cantidad ({component.quantity}).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Proceso">
              <NativeSelect value={form.process} onChange={(e) => set('process', e.target.value as ManufacturingProcess | '')}>
                <option value="">—</option>
                {MANUFACTURING_PROCESSES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Máquina / herramienta">
              <Input value={form.machine} onChange={(e) => set('machine', e.target.value)} placeholder="Ej: Torno CNC, Prusa MK4" />
            </Field>
            <Field label="Taller">
              <Input value={form.workshop} onChange={(e) => set('workshop', e.target.value)} placeholder="Ej: Taller EIM, FabLab" />
            </Field>
            <Field label="Responsable de fabricación">
              <UserPicker users={members} value={form.responsibleId} onChange={(id) => set('responsibleId', id)} />
            </Field>

            <p className="sm:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tiempos por unidad (minutos) · total {formatHours(totalMin / 60)}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
              <Field label="Preparación">
                <Input type="number" min={0} value={form.setupMinutes} onChange={(e) => set('setupMinutes', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Mecanizado">
                <Input type="number" min={0} value={form.machineMinutes} onChange={(e) => set('machineMinutes', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Acabado">
                <Input type="number" min={0} value={form.finishingMinutes} onChange={(e) => set('finishingMinutes', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Inspección">
                <Input type="number" min={0} value={form.inspectionMinutes} onChange={(e) => set('inspectionMinutes', e.target.value)} placeholder="0" />
              </Field>
            </div>

            <Field label="Fecha programada">
              <Input type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />
            </Field>
            <Field label="Fecha real">
              <Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.needsWorkshop} onChange={(e) => set('needsWorkshop', e.target.checked)} /> Necesita taller
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.needsExternal} onChange={(e) => set('needsExternal', e.target.checked)} /> Necesita proveedor externo
            </label>
            <Field label="Notas" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Tolerancias críticas, fixtures, orden de operaciones…" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
