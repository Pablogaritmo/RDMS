import { UserPicker } from '@/components/domain/pickers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Avatar, PageHeader } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { formatDate, formatMoney } from '@/lib/format';
import { useCreateSystem, useDeleteProject, useDeleteSystem, useMilestoneMutation, useProjectMemberMutation, useUpdateProject } from '@/lib/queries';
import { cn, numOrNull, strOrNull } from '@/lib/utils';
import { PROJECT_STATUSES, type Milestone, type ProjectStatus, type System } from '@rdms/shared';
import { Flag, Pencil, Plus, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { SystemEditDialog } from './system-detail';

export function ProjectSettingsPage() {
  const { canManageProject, isAdmin } = useProject();
  if (!canManageProject) {
    return <p className="text-sm text-muted-foreground">Solo el líder del proyecto o un administrador puede ver esta página.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configuración del proyecto" description="Información general, equipo, sistemas e hitos." />
      <ProjectInfoCard />
      <MembersCard />
      <div id="systems">
        <SystemsCard />
      </div>
      <div id="milestones">
        <MilestonesCard />
      </div>
      {isAdmin ? <DangerZone /> : null}
    </div>
  );
}

function ProjectInfoCard() {
  const { project } = useProject();
  const update = useUpdateProject(project.id);
  const [form, setForm] = React.useState({
    name: project.name,
    competition: project.competition ?? '',
    description: project.description ?? '',
    status: project.status as ProjectStatus,
    startDate: project.startDate ?? '',
    targetDate: project.targetDate ?? '',
    budget: project.budget != null ? String(project.budget) : '',
    currency: project.currency,
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        name: form.name.trim(),
        competition: strOrNull(form.competition),
        description: strOrNull(form.description),
        status: form.status,
        startDate: strOrNull(form.startDate),
        targetDate: strOrNull(form.targetDate),
        budget: numOrNull(form.budget),
        currency: form.currency.trim().toUpperCase() || 'CRC',
      },
      { onSuccess: () => toast.success('Proyecto actualizado'), onError: (err) => toast.error(err.message) },
    );
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Información general</CardTitle>
          <CardDescription>Nombre, competencia, fechas y presupuesto total.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nombre" className="lg:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Competencia / evento" className="lg:col-span-2">
            <Input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })} placeholder="Ej: Spaceport America Cup 2027" />
          </Field>
          <Field label="Estado">
            <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fecha de inicio">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Fecha objetivo">
            <Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
          </Field>
          <div className="grid grid-cols-[1fr_72px] gap-2">
            <Field label="Presupuesto">
              <Input type="number" min={0} step="any" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </Field>
            <Field label="Moneda">
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={5} className="font-mono uppercase" />
            </Field>
          </div>
          <Field label="Descripción" className="sm:col-span-2 lg:col-span-4">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <Button type="submit" loading={update.isPending}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MembersCard() {
  const { project, members, usersById, user, isAdmin } = useProject();
  const mutation = useProjectMemberMutation(project.id);
  const [picker, setPicker] = React.useState<string | null>(null);
  const nonMembers = [...usersById.values()].filter((u) => u.isActive && !members.some((m) => m.id === u.id));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Equipo del proyecto</CardTitle>
          <CardDescription>Los miembros ven todo el proyecto. Los líderes pueden editar cualquier componente, gestionar sistemas e hitos.</CardDescription>
        </div>
        <UserPicker
          users={nonMembers}
          value={picker}
          onChange={(id) => {
            if (id) mutation.mutate({ userId: id, role: 'member' }, { onSuccess: () => toast.success('Miembro agregado'), onError: (e) => toast.error(e.message) });
            setPicker(null);
          }}
          allowClear={false}
          size="sm"
          placeholder="Agregar miembro"
        />
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
              <Avatar user={m} size="sm" />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', !m.isActive && 'line-through text-muted-foreground')}>{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {!m.isActive ? <Badge variant="muted">Inactivo</Badge> : null}
              <NativeSelect
                value={m.role}
                onChange={(e) => mutation.mutate({ userId: m.id, role: e.target.value as 'lead' | 'member' }, { onError: (err) => toast.error(err.message) })}
                className="h-8 w-40 text-xs"
                disabled={m.id === user.id && !isAdmin}
              >
                <option value="member">Miembro</option>
                <option value="lead">Líder de proyecto</option>
              </NativeSelect>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Quitar del proyecto"
                disabled={m.id === user.id && !isAdmin}
                onClick={() => {
                  if (confirm(`¿Quitar a ${m.name} del proyecto? Sus componentes conservarán el historial.`)) mutation.mutate({ userId: m.id, remove: true }, { onError: (e) => toast.error(e.message) });
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SystemsCard() {
  const { project, systems, components, usersById } = useProject();
  const create = useCreateSystem(project.id);
  const del = useDeleteSystem(project.id);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<System | null>(null);
  const [form, setForm] = React.useState({ name: '', code: '', budget: '', leadId: null as string | null, description: '' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: form.name.trim(), code: form.code.trim().toUpperCase(), budget: numOrNull(form.budget), leadId: form.leadId, description: strOrNull(form.description) },
      {
        onSuccess: () => {
          toast.success('Sistema creado');
          setOpen(false);
          setForm({ name: '', code: '', budget: '', leadId: null, description: '' });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sistemas</CardTitle>
          <CardDescription>Cada sistema agrupa componentes y tiene su propio código, presupuesto y líder.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Nuevo sistema
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {systems.map((s) => {
            const n = components.filter((c) => c.systemId === s.id).length;
            const lead = s.members.find((m) => m.role === 'lead');
            return (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-10 font-mono text-xs text-muted-foreground">{s.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {n} componentes · {s.budget != null ? formatMoney(s.budget, project.currency) : 'sin presupuesto'} · líder: {lead?.name ?? '—'}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditing(s)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Eliminar"
                  disabled={n > 0}
                  title={n > 0 ? 'Mueve o elimina sus componentes primero' : 'Eliminar sistema'}
                  onClick={() => confirm(`¿Eliminar el sistema ${s.name}?`) && del.mutate(s.id, { onSuccess: () => toast.success('Sistema eliminado'), onError: (e) => toast.error(e.message) })}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
          {systems.length === 0 ? <li className="py-4 text-center text-xs text-muted-foreground">Todavía no hay sistemas.</li> : null}
        </ul>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>Nuevo sistema</DialogTitle>
              <DialogDescription>El código se usa como prefijo de los componentes (ej. REC → REC-001).</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Recuperación" required autoFocus />
              </Field>
              <Field label="Código">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="REC" maxLength={8} required className="font-mono" />
              </Field>
              <Field label={`Presupuesto (${project.currency})`}>
                <Input type="number" min={0} step="any" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </Field>
              <Field label="Líder">
                <UserPicker users={[...usersById.values()]} value={form.leadId} onChange={(id) => setForm({ ...form, leadId: id })} />
              </Field>
              <Field label="Descripción" className="sm:col-span-2">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={create.isPending}>
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {editing ? <SystemEditDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} system={editing} /> : null}
    </Card>
  );
}

function MilestonesCard() {
  const { project, milestones } = useProject();
  const mutation = useMilestoneMutation(project.id);
  const [editing, setEditing] = React.useState<Milestone | null | 'new'>(null);
  const [form, setForm] = React.useState({ name: '', date: '', description: '' });
  const openEdit = (m: Milestone | 'new') => {
    setForm(m === 'new' ? { name: '', date: '', description: '' } : { name: m.name, date: m.date, description: m.description ?? '' });
    setEditing(m);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { name: form.name.trim(), date: form.date, description: strOrNull(form.description) };
    mutation.mutate(editing === 'new' ? { input } : { id: (editing as Milestone).id, input }, {
      onSuccess: () => {
        toast.success(editing === 'new' ? 'Hito creado' : 'Hito actualizado');
        setEditing(null);
      },
      onError: (err) => toast.error(err.message),
    });
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Hitos</CardTitle>
          <CardDescription>Revisiones de diseño (SRR, PDR, CDR, TRR), pruebas, integración, lanzamiento… Los nombres son libres.</CardDescription>
        </div>
        <Button size="sm" onClick={() => openEdit('new')}>
          <Plus /> Nuevo hito
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
              <Flag className={cn('size-4', m.completedAt ? 'text-emerald-600' : 'text-muted-foreground')} />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', m.completedAt && 'text-muted-foreground')}>{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(m.date)}
                  {m.completedAt ? ` · completado ${formatDate(m.completedAt)}` : ''}
                  {m.description ? ` · ${m.description}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openEdit(m)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar el hito ${m.name}?`) && mutation.mutate({ id: m.id, remove: true }, { onError: (e) => toast.error(e.message) })}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {milestones.length === 0 ? <li className="py-4 text-center text-xs text-muted-foreground">Todavía no hay hitos.</li> : null}
        </ul>
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>{editing === 'new' ? 'Nuevo hito' : 'Editar hito'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Field label="Nombre">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PDR — Preliminary Design Review" required autoFocus />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </Field>
              <Field label="Descripción">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DangerZone() {
  const { project } = useProject();
  const navigate = useNavigate();
  const del = useDeleteProject({ onSuccess: () => navigate('/projects') });
  const [confirmText, setConfirmText] = React.useState('');
  return (
    <Card className="border-red-200">
      <CardHeader>
        <div>
          <CardTitle className="text-red-700">Zona de peligro</CardTitle>
          <CardDescription>Eliminar el proyecto borra sistemas, componentes, dependencias e historial. No se puede deshacer.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <Field label={`Escribe "${project.name}" para confirmar`} className="min-w-[260px]">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </Field>
        <Button variant="destructive" disabled={confirmText !== project.name} loading={del.isPending} onClick={() => del.mutate(project.id, { onError: (e) => toast.error(e.message), onSuccess: () => toast.success('Proyecto eliminado') })}>
          <Trash2 /> Eliminar proyecto
        </Button>
      </CardContent>
    </Card>
  );
}
