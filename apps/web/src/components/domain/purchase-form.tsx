import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { formatMoney } from '@/lib/format';
import { usePurchaseMutation } from '@/lib/queries';
import { numOrNull, strOrNull } from '@/lib/utils';
import { PURCHASE_STATUSES, type Purchase, type PurchaseInput, type PurchaseStatus } from '@rdms/shared';
import { Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ComponentPicker } from './pickers';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];
export const PURCHASE_STATUS_VARIANT: Record<PurchaseStatus, BadgeVariant> = {
  to_buy: 'warning',
  ordered: 'info',
  in_transit: 'violet',
  received: 'success',
  cancelled: 'muted',
};

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge variant={PURCHASE_STATUS_VARIANT[status]}>{PURCHASE_STATUSES.find((s) => s.key === status)?.label}</Badge>;
}

interface State {
  name: string;
  description: string;
  quantity: string;
  unitCost: string;
  shippingCost: string;
  additionalCost: string;
  supplier: string;
  url: string;
  status: PurchaseStatus;
  leadTimeDays: string;
  orderedAt: string;
  expectedAt: string;
  receivedAt: string;
  notes: string;
  componentIds: string[];
}

const fromPurchase = (p: Purchase | null, defaults: { componentIds?: string[] }): State => ({
  name: p?.name ?? '',
  description: p?.description ?? '',
  quantity: p ? String(p.quantity) : '1',
  unitCost: p && p.unitCost ? String(p.unitCost) : '',
  shippingCost: p && p.shippingCost ? String(p.shippingCost) : '',
  additionalCost: p && p.additionalCost ? String(p.additionalCost) : '',
  supplier: p?.supplier ?? '',
  url: p?.url ?? '',
  status: p?.status ?? 'to_buy',
  leadTimeDays: p?.leadTimeDays != null ? String(p.leadTimeDays) : '',
  orderedAt: p?.orderedAt ?? '',
  expectedAt: p?.expectedAt ?? '',
  receivedAt: p?.receivedAt ?? '',
  notes: p?.notes ?? '',
  componentIds: p?.componentIds ?? defaults.componentIds ?? [],
});

export function PurchaseDialog({ open, onOpenChange, purchase = null, defaultComponentIds }: { open: boolean; onOpenChange: (o: boolean) => void; purchase?: Purchase | null; defaultComponentIds?: string[] }) {
  const { project, components, componentsById, systemsById, canManageProject, user } = useProject();
  const mutation = usePurchaseMutation(project.id);
  const canDelete = !!purchase && (canManageProject || purchase.requestedById === user.id);
  const [form, setForm] = React.useState<State>(() => fromPurchase(purchase, { componentIds: defaultComponentIds }));
  const set = <K extends keyof State>(k: K, v: State[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (open) setForm(fromPurchase(purchase, { componentIds: defaultComponentIds }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchase?.id]);

  const total = (numOrNull(form.quantity) ?? 0) * (numOrNull(form.unitCost) ?? 0) + (numOrNull(form.shippingCost) ?? 0) + (numOrNull(form.additionalCost) ?? 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('El nombre es obligatorio');
    const input: PurchaseInput = {
      name: form.name.trim(),
      description: strOrNull(form.description),
      quantity: numOrNull(form.quantity) ?? 1,
      unitCost: numOrNull(form.unitCost) ?? 0,
      shippingCost: numOrNull(form.shippingCost) ?? 0,
      additionalCost: numOrNull(form.additionalCost) ?? 0,
      supplier: strOrNull(form.supplier),
      url: strOrNull(form.url),
      status: form.status,
      leadTimeDays: numOrNull(form.leadTimeDays) == null ? null : Math.round(numOrNull(form.leadTimeDays)!),
      orderedAt: strOrNull(form.orderedAt),
      expectedAt: strOrNull(form.expectedAt),
      receivedAt: strOrNull(form.receivedAt),
      notes: strOrNull(form.notes),
      componentIds: form.componentIds,
    };
    mutation.mutate(
      { id: purchase?.id, input },
      {
        onSuccess: () => {
          toast.success(purchase ? 'Compra actualizada' : 'Compra registrada');
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
            <DialogTitle>{purchase ? 'Editar compra' : 'Nueva compra'}</DialogTitle>
            <DialogDescription>Asóciala a los componentes que la necesitan: así el sistema avisa si el tiempo de entrega choca con sus fechas límite.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder='Ej: Paracaídas Iris Ultra 72"' required autoFocus={!purchase} />
            </Field>
            <Field label="Proveedor">
              <Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Fruity Chutes, McMaster-Carr…" />
            </Field>
            <Field label="Enlace (opcional)">
              <Input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad">
                <Input type="number" min={0} step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              </Field>
              <Field label={`Costo unitario (${project.currency})`}>
                <Input type="number" min={0} step="any" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Envío">
                <Input type="number" min={0} step="any" value={form.shippingCost} onChange={(e) => set('shippingCost', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Adicionales" hint="Impuestos, aduana">
                <Input type="number" min={0} step="any" value={form.additionalCost} onChange={(e) => set('additionalCost', e.target.value)} placeholder="0" />
              </Field>
            </div>
            <Field label="Estado">
              <NativeSelect value={form.status} onChange={(e) => set('status', e.target.value as PurchaseStatus)}>
                {PURCHASE_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tiempo de entrega (días)" hint="Para estimar la llegada antes de tener fecha">
              <Input type="number" min={0} value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} placeholder="21" />
            </Field>
            <Field label="Fecha de pedido">
              <Input type="date" value={form.orderedAt} onChange={(e) => set('orderedAt', e.target.value)} />
            </Field>
            <Field label="Fecha esperada">
              <Input type="date" value={form.expectedAt} onChange={(e) => set('expectedAt', e.target.value)} />
            </Field>
            <Field label="Fecha de recepción">
              <Input type="date" value={form.receivedAt} onChange={(e) => set('receivedAt', e.target.value)} />
            </Field>
            <div className="flex items-end justify-end text-sm">
              <span className="text-muted-foreground">Total:&nbsp;</span>
              <b className="tabular">{formatMoney(total, project.currency)}</b>
            </div>
            <Field label="Componentes asociados" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {form.componentIds.map((id) => {
                  const c = componentsById.get(id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2 pr-1 text-xs">
                      <span className="font-mono text-muted-foreground">{c?.code ?? '?'}</span> {c?.name}
                      <button type="button" className="rounded-full p-0.5 hover:bg-muted cursor-pointer" onClick={() => set('componentIds', form.componentIds.filter((x) => x !== id))} aria-label="Quitar">
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
                <ComponentPicker
                  components={components}
                  exclude={new Set(form.componentIds)}
                  systemsById={systemsById}
                  onSelect={(c) => set('componentIds', [...form.componentIds, c.id])}
                  trigger={
                    <Button type="button" variant="outline" size="xs">
                      + Componente
                    </Button>
                  }
                />
              </div>
            </Field>
            <Field label="Descripción / notas" className="sm:col-span-2">
              <Textarea value={form.notes || form.description} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Número de pedido, especificaciones, tracking…" />
            </Field>
          </div>
          <DialogFooter className="sm:justify-between">
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`¿Eliminar la compra «${purchase!.name}»?`)) {
                    mutation.mutate({ id: purchase!.id, remove: true }, { onSuccess: () => { toast.success('Compra eliminada'); onOpenChange(false); }, onError: (e) => toast.error(e.message) });
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
                {purchase ? 'Guardar' : 'Registrar compra'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
