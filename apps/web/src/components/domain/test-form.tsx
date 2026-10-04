import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { useTestMutation } from '@/lib/queries';
import { strOrNull } from '@/lib/utils';
import { TEST_STATUSES, TEST_TYPE_SUGGESTIONS, type Test, type TestInput, type TestStatus } from '@rdms/shared';
import { Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { UserPicker } from './pickers';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];
export const TEST_STATUS_VARIANT: Record<TestStatus, BadgeVariant> = {
  planned: 'muted',
  ready: 'info',
  executed: 'violet',
  passed: 'success',
  failed: 'danger',
};

export function TestStatusBadge({ status }: { status: TestStatus }) {
  return <Badge variant={TEST_STATUS_VARIANT[status]}>{TEST_STATUSES.find((s) => s.key === status)?.label}</Badge>;
}

interface State {
  name: string;
  type: string;
  systemId: string;
  componentId: string;
  date: string;
  responsibleId: string | null;
  objective: string;
  result: string;
  status: TestStatus;
  observations: string;
}

const fromTest = (t: Test | null, d: { systemId?: string; componentId?: string; userId: string }): State => ({
  name: t?.name ?? '',
  type: t?.type ?? '',
  systemId: t?.systemId ?? d.systemId ?? '',
  componentId: t?.componentId ?? d.componentId ?? '',
  date: t?.date ?? '',
  responsibleId: t ? t.responsibleId : d.userId,
  objective: t?.objective ?? '',
  result: t?.result ?? '',
  status: t?.status ?? 'planned',
  observations: t?.observations ?? '',
});

export function TestDialog({ open, onOpenChange, test = null, defaultSystemId, defaultComponentId }: { open: boolean; onOpenChange: (o: boolean) => void; test?: Test | null; defaultSystemId?: string; defaultComponentId?: string }) {
  const { project, systems, components, members, user, canManageProject, canManageSystem } = useProject();
  const mutation = useTestMutation(project.id);
  const canDelete = !!test && (canManageProject || (test.systemId ? canManageSystem(test.systemId) : false) || test.responsibleId === user.id);
  const [form, setForm] = React.useState<State>(() => fromTest(test, { systemId: defaultSystemId, componentId: defaultComponentId, userId: user.id }));
  const set = <K extends keyof State>(k: K, v: State[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (open) setForm(fromTest(test, { systemId: defaultSystemId, componentId: defaultComponentId, userId: user.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, test?.id]);

  const scopedComponents = form.systemId ? components.filter((c) => c.systemId === form.systemId) : components;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('El nombre es obligatorio');
    const input: TestInput = {
      name: form.name.trim(),
      type: strOrNull(form.type),
      systemId: form.systemId || null,
      componentId: form.componentId || null,
      date: strOrNull(form.date),
      responsibleId: form.responsibleId,
      objective: strOrNull(form.objective),
      result: strOrNull(form.result),
      status: form.status,
      observations: strOrNull(form.observations),
    };
    mutation.mutate(
      { id: test?.id, input },
      {
        onSuccess: () => {
          toast.success(test ? 'Prueba actualizada' : 'Prueba creada');
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
            <DialogTitle>{test ? 'Editar prueba' : 'Nueva prueba'}</DialogTitle>
            <DialogDescription>Objetivo y resultado en una línea cada uno; los archivos (datos, fotos, video) se adjuntan después desde la ficha de la prueba.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Prueba de eyección en tierra" required autoFocus={!test} />
            </Field>
            <Field label="Tipo">
              <Input value={form.type} onChange={(e) => set('type', e.target.value)} list="test-types" placeholder="Estructural, funcional…" />
              <datalist id="test-types">
                {TEST_TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Estado">
              <NativeSelect value={form.status} onChange={(e) => set('status', e.target.value as TestStatus)}>
                {TEST_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Sistema">
              <NativeSelect
                value={form.systemId}
                onChange={(e) => {
                  set('systemId', e.target.value);
                  if (form.componentId && !components.find((c) => c.id === form.componentId && c.systemId === e.target.value)) set('componentId', '');
                }}
              >
                <option value="">— Proyecto completo —</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Componente (opcional)">
              <NativeSelect value={form.componentId} onChange={(e) => set('componentId', e.target.value)}>
                <option value="">—</option>
                {scopedComponents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Responsable">
              <UserPicker users={members} value={form.responsibleId} onChange={(id) => set('responsibleId', id)} />
            </Field>
            <Field label="Objetivo" className="sm:col-span-2">
              <Textarea value={form.objective} onChange={(e) => set('objective', e.target.value)} rows={2} placeholder="¿Qué se quiere verificar y con qué criterio de éxito?" />
            </Field>
            <Field label="Resultado" className="sm:col-span-2">
              <Textarea value={form.result} onChange={(e) => set('result', e.target.value)} rows={2} placeholder="Qué se midió / observó" />
            </Field>
            <Field label="Observaciones" className="sm:col-span-2">
              <Textarea value={form.observations} onChange={(e) => set('observations', e.target.value)} rows={2} />
            </Field>
          </div>
          <DialogFooter className="sm:justify-between">
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`¿Eliminar la prueba «${test!.name}»?`)) {
                    mutation.mutate({ id: test!.id, remove: true }, { onSuccess: () => { toast.success('Prueba eliminada'); onOpenChange(false); }, onError: (e) => toast.error(e.message) });
                  }
                }}
              >
                <Trash2 /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {test ? 'Guardar' : 'Crear prueba'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
