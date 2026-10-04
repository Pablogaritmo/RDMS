import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useChangePassword } from '@/lib/queries';
import * as React from 'react';
import { toast } from 'sonner';

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const mutation = useChangePassword();

  React.useEffect(() => {
    if (!open) {
      setCurrent('');
      setNext('');
      setConfirm('');
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return toast.error('La nueva contraseña debe tener al menos 8 caracteres');
    if (next !== confirm) return toast.error('Las contraseñas no coinciden');
    mutation.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success('Contraseña actualizada');
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
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>Se cerrarán tus otras sesiones activas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Contraseña actual">
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
            </Field>
            <Field label="Confirmar nueva contraseña">
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
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
