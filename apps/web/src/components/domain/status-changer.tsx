import { StatusBadge, STATUS_DOT } from '@/components/domain/badges';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { useChangeStatus } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { allowedTransitions, isDoneStatus, STATUS_BY_KEY, statusOrder, type Component, type ComponentStatus } from '@rdms/shared';
import { ArrowDownLeft, ArrowUpRight, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

/**
 * One-click status change. Shows only valid transitions. Asks for an optional
 * note when moving backwards (rework) or completing with unfinished dependencies.
 */
export function StatusChanger({ component, size = 'sm', className, disabled }: { component: Component; size?: 'xs' | 'sm' | 'default'; className?: string; disabled?: boolean }) {
  const { project, canEdit, componentsById } = useProject();
  const mutation = useChangeStatus(project.id);
  const [pending, setPending] = React.useState<ComponentStatus | null>(null);
  const [note, setNote] = React.useState('');

  const editable = !disabled && canEdit(component);
  const options = allowedTransitions(component.status);
  const forward = options.filter((s) => statusOrder(s) > statusOrder(component.status));
  const backward = options.filter((s) => statusOrder(s) < statusOrder(component.status));

  const unfinishedDeps = component.dependsOn.map((id) => componentsById.get(id)).filter((d): d is Component => !!d && !isDoneStatus(d.status));

  const commit = (status: ComponentStatus, n?: string) => {
    mutation.mutate(
      { id: component.id, input: { status, note: n?.trim() || null } },
      {
        onSuccess: (res) => {
          setPending(null);
          setNote('');
          const label = STATUS_BY_KEY[status].label;
          if (res.unblocked.length) {
            toast.success(`${component.code} → ${label}`, {
              description: `${res.unblocked.length} componente(s) que dependían de este pueden continuar: ${res.unblocked.map((u) => u.code).join(', ')}`,
            });
          } else {
            toast.success(`${component.code} → ${label}`);
          }
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const select = (status: ComponentStatus) => {
    const isBackward = statusOrder(status) < statusOrder(component.status);
    const completingWithDeps = isDoneStatus(status) && unfinishedDeps.length > 0;
    if (isBackward || completingWithDeps) setPending(status);
    else commit(status);
  };

  const trigger = (
    <button
      type="button"
      disabled={!editable || mutation.isPending}
      className={cn(
        'group inline-flex items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        editable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
        className,
      )}
      title={editable ? 'Cambiar estado' : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <StatusBadge status={component.status} className={size === 'default' ? 'px-2 py-1 text-xs' : undefined} />
      {editable ? <ChevronDown className="size-3 text-muted-foreground opacity-60 group-hover:opacity-100" /> : null}
    </button>
  );

  if (!editable) return trigger;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" onClick={(e) => e.stopPropagation()}>
          {forward.length ? (
            <>
              <DropdownMenuLabel>Avanzar a</DropdownMenuLabel>
              {forward.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => select(s)}>
                  <span className={cn('size-2 rounded-full', STATUS_DOT[s])} />
                  {STATUS_BY_KEY[s].label}
                  <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {forward.length && backward.length ? <DropdownMenuSeparator /> : null}
          {backward.length ? (
            <>
              <DropdownMenuLabel>Regresar a</DropdownMenuLabel>
              {backward.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => select(s)}>
                  <span className={cn('size-2 rounded-full', STATUS_DOT[s])} />
                  {STATUS_BY_KEY[s].label}
                  <ArrowDownLeft className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {component.code} → {pending ? STATUS_BY_KEY[pending].label : ''}
            </DialogTitle>
            <DialogDescription>
              {pending && statusOrder(pending) < statusOrder(component.status)
                ? 'Vas a regresar el componente a una etapa anterior. Explica brevemente el motivo (queda en el historial).'
                : `Este componente depende de ${unfinishedDeps.length} componente(s) que aún no están completados: ${unfinishedDeps.map((d) => d.code).join(', ')}. ¿Marcarlo igualmente?`}
            </DialogDescription>
          </DialogHeader>
          <Field label="Nota (opcional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: la pieza no pasó la medición del diámetro interno" autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button loading={mutation.isPending} onClick={() => pending && commit(pending, note)}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
