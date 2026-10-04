import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { useProject } from '@/hooks/use-project';
import { useInspectionMutation } from '@/lib/queries';
import { cn, strOrNull } from '@/lib/utils';
import { INSPECTION_RESULTS, STATUS_BY_KEY, todayISO, type Component, type InspectionResult } from '@rdms/shared';
import { CheckCircle2, CircleAlert, XCircle } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];
const RESULT_VARIANT: Record<InspectionResult, BadgeVariant> = { approved: 'success', approved_with_notes: 'warning', rejected: 'danger' };
const RESULT_ICON: Record<InspectionResult, React.ComponentType<{ className?: string }>> = { approved: CheckCircle2, approved_with_notes: CircleAlert, rejected: XCircle };

export function InspectionResultBadge({ result }: { result: InspectionResult }) {
  const Icon = RESULT_ICON[result];
  return (
    <Badge variant={RESULT_VARIANT[result]}>
      <Icon /> {INSPECTION_RESULTS.find((r) => r.key === result)?.label}
    </Badge>
  );
}

export function InspectionDialog({ open, onOpenChange, component }: { open: boolean; onOpenChange: (o: boolean) => void; component: Component }) {
  const { project } = useProject();
  const mutation = useInspectionMutation(project.id);
  const [result, setResult] = React.useState<InspectionResult>('approved');
  const [date, setDate] = React.useState(todayISO());
  const [observations, setObservations] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setResult('approved');
      setDate(todayISO());
      setObservations('');
    }
  }, [open]);

  const consequence =
    result === 'rejected'
      ? `El componente regresará a «${component.manufacturing || ['pending_manufacturing', 'in_manufacturing', 'inspection', 'completed', 'integrated'].includes(component.status) ? 'En fabricación' : 'Diseño'}».`
      : component.status === 'inspection'
        ? 'El componente pasará a «Completado».'
        : `El estado actual (${STATUS_BY_KEY[component.status].label}) no cambia.`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (result !== 'approved' && !observations.trim()) return toast.error('Describe las observaciones o el motivo del rechazo');
    mutation.mutate(
      { input: { componentId: component.id, date, result, observations: strOrNull(observations) } },
      {
        onSuccess: (res) => {
          const payload = res as { statusChange?: { component: { status: string } } | null };
          toast.success('Inspección registrada', { description: payload.statusChange ? `Estado: ${STATUS_BY_KEY[payload.statusChange.component.status as keyof typeof STATUS_BY_KEY].label}` : undefined });
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Inspeccionar {component.code}</DialogTitle>
            <DialogDescription>{component.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-1.5">
              {INSPECTION_RESULTS.map((r) => {
                const Icon = RESULT_ICON[r.key];
                const active = result === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setResult(r.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-center text-xs transition-colors cursor-pointer hover:bg-accent',
                      active && r.key === 'approved' && 'border-emerald-500 bg-emerald-50 text-emerald-800',
                      active && r.key === 'approved_with_notes' && 'border-amber-500 bg-amber-50 text-amber-800',
                      active && r.key === 'rejected' && 'border-red-500 bg-red-50 text-red-800',
                    )}
                  >
                    <Icon className="size-4" />
                    {r.label}
                  </button>
                );
              })}
            </div>
            <Field label="Fecha">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label={result === 'approved' ? 'Observaciones (opcional)' : 'Observaciones'}>
              <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} placeholder={result === 'rejected' ? 'Qué falló y qué hay que corregir' : 'Medidas verificadas, acabados, notas…'} autoFocus />
            </Field>
            <p className="text-xs text-muted-foreground">{consequence} Puedes adjuntar fotos a la inspección después de registrarla.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending} variant={result === 'rejected' ? 'destructive' : 'default'}>
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
