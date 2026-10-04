import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { Avatar, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { useCreateUser, useMe, useUpdateUser, useUsers } from '@/lib/queries';
import { cn, strOrNull } from '@/lib/utils';
import { USER_ROLE_LABELS, type User, type UserRole } from '@rdms/shared';
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

export function UsersPage() {
  const me = useMe();
  const users = useUsers();
  const update = useUpdateUser();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [resetting, setResetting] = React.useState<User | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);

  const list = (users.data ?? []).filter((u) => showInactive || u.isActive);

  const toggleActive = (u: User) => {
    update.mutate(
      { id: u.id, input: { isActive: !u.isActive } },
      { onSuccess: () => toast.success(u.isActive ? `${u.name} desactivado. Su historial se conserva.` : `${u.name} reactivado.`), onError: (e) => toast.error(e.message) },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Usuarios"
        description="Miembros del club. Desactivar a alguien (por ejemplo, al graduarse) conserva todo su historial."
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="size-4 accent-primary" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inactivos
            </label>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Nuevo usuario
            </Button>
          </>
        }
      />
      {users.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="hidden md:table-cell">Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((u) => (
                <TableRow key={u.id} className={cn(!u.isActive && 'opacity-60')}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.name} {u.id === me.data?.id ? <span className="text-xs text-muted-foreground">(tú)</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'violet' : 'secondary'}>{USER_ROLE_LABELS[u.role]}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{u.isActive ? <Badge variant="success">Activo</Badge> : <Badge variant="muted">Inactivo</Badge>}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditing(u)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Restablecer contraseña" onClick={() => setResetting(u)}>
                        <KeyRound />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={u.isActive ? 'Desactivar' : 'Reactivar'} disabled={u.id === me.data?.id} onClick={() => toggleActive(u)}>
                        {u.isActive ? <UserX /> : <UserCheck />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <UserDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing ? <UserDialog open onOpenChange={(o) => !o && setEditing(null)} user={editing} /> : null}
      {resetting ? <ResetPasswordDialog open onOpenChange={(o) => !o && setResetting(null)} user={resetting} /> : null}
    </div>
  );
}

function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: User }) {
  const me = useMe();
  const create = useCreateUser();
  const update = useUpdateUser();
  const [form, setForm] = React.useState({ name: user?.name ?? '', email: user?.email ?? '', password: '', role: (user?.role ?? 'member') as UserRole, avatarUrl: user?.avatarUrl ?? '' });

  React.useEffect(() => {
    if (open) setForm({ name: user?.name ?? '', email: user?.email ?? '', password: '', role: (user?.role ?? 'member') as UserRole, avatarUrl: user?.avatarUrl ?? '' });
  }, [open, user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      update.mutate(
        { id: user.id, input: { name: form.name.trim(), email: form.email.trim(), role: form.role, avatarUrl: strOrNull(form.avatarUrl) } },
        {
          onSuccess: () => {
            toast.success('Usuario actualizado');
            onOpenChange(false);
          },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      if (form.password.length < 8) return toast.error('La contraseña debe tener al menos 8 caracteres');
      create.mutate(
        { name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role, avatarUrl: strOrNull(form.avatarUrl) },
        {
          onSuccess: (u) => {
            toast.success(`${u.name} creado. Comparte la contraseña inicial de forma segura.`);
            onOpenChange(false);
          },
          onError: (err) => toast.error(err.message),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{user ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>{user ? 'Los cambios de rol aplican de inmediato.' : 'La persona podrá cambiar su contraseña después de entrar.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Nombre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Correo">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
            {!user ? (
              <Field label="Contraseña inicial" hint="Mínimo 8 caracteres">
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="off" />
              </Field>
            ) : null}
            <Field label="Rol" hint="Los líderes de proyecto y de sistema se asignan dentro de cada proyecto.">
              <NativeSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} disabled={user?.id === me.data?.id}>
                <option value="member">Miembro</option>
                <option value="admin">Administrador</option>
              </NativeSelect>
            </Field>
            <Field label="URL de avatar (opcional)">
              <Input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {user ? 'Guardar' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: User }) {
  const update = useUpdateUser();
  const [password, setPassword] = React.useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { id: user.id, input: { password } },
      {
        onSuccess: () => {
          toast.success(`Contraseña de ${user.name} restablecida. Sus sesiones fueron cerradas.`);
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
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>Define una contraseña temporal para {user.name} y compártela de forma segura.</DialogDescription>
          </DialogHeader>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={update.isPending}>
              Restablecer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
