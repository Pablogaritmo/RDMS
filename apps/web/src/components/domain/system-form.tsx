import { UserPicker } from '@/components/domain/pickers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { useUpdateSystem } from '@/lib/queries';
import { numOrNull, strOrNull } from '@/lib/utils';
import type { System } from '@rdms/shared';
import * as React from 'react';
import { toast } from 'sonner';

export function SystemEditDialog({ open, onOpenChange, system }: { open: boolean; onOpenChange: (o: boolean) => void; system: System }) {
  const { project, members, canManageProject } = useProject();
  const update = useUpdateSystem(project.id);
  const lead = system.members.find((m) => m.role === 'lead');
  const [form, setForm] = React.useState({ name: system.name, code: system.code, description: system.description ?? '', budget: system.budget != null ? String(system.budget) : '', leadId: lead?.id ?? null });

  React.useEffect(() => {
    if (open) setForm({ name: system.name, code: system.code, description: system.description ?? '', budget: system.budget != null ? String(system.budget) : '', leadId: lead?.id ?? null });
  }, [open, system, lead?.id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: Record<string, unknown> = { name: form.name.trim(), description: strOrNull(form.description) };
    if (canManageProject) {
      input.code = form.code.trim().toUpperCase();
      input.budget = numOrNull(form.budget);
      if ((lead?.id ?? null) !== form.leadId) input.leadId = form.leadId;
    }
    update.mutate(
      { id: system.id, input },
      {
        onSuccess: () => {
          toast.success('Sistema actualizado');
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Editar sistema</DialogTitle>
            <DialogDescription>Código, presupuesto y líder solo los cambia el líder del proyecto.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Código" hint="Prefijo de los componentes (REC-001)">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="font-mono" maxLength={8} disabled={!canManageProject} />
            </Field>
            <Field label={`Presupuesto (${project.currency})`}>
              <Input type="number" min={0} step="any" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} disabled={!canManageProject} />
            </Field>
            <Field label="Líder del sistema" className="sm:col-span-2">
              <UserPicker users={members} value={form.leadId} onChange={(id) => setForm({ ...form, leadId: id })} disabled={!canManageProject} />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={update.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
