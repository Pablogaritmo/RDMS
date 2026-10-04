import { ProjectStatusBadge } from '@/components/domain/badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { EmptyState, PageHeader, Progress, Skeleton } from '@/components/ui/misc';
import { formatDate, formatMoney, pct } from '@/lib/format';
import { useCreateProject, useMe, useProjects } from '@/lib/queries';
import { numOrNull, strOrNull } from '@/lib/utils';
import { FolderKanban, Plus, Users } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

export function ProjectsPage() {
  const me = useMe();
  const projects = useProjects();
  const [open, setOpen] = React.useState(false);
  const isAdmin = me.data?.role === 'admin';
  const list = projects.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Proyectos"
        description="Cada proyecto (cohete, competencia o línea de investigación) está completamente separado de los demás."
        actions={
          isAdmin ? (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Nuevo proyecto
            </Button>
          ) : null
        }
      />
      {projects.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No tienes proyectos"
          description={isAdmin ? 'Crea el primer proyecto del club.' : 'Pide a un administrador o líder de proyecto que te agregue a un proyecto.'}
          action={
            isAdmin ? (
              <Button onClick={() => setOpen(true)}>
                <Plus /> Nuevo proyecto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`} className="group">
              <Card className="h-full transition-colors group-hover:bg-accent/40">
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{p.name}</CardTitle>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.competition ?? p.description ?? '—'}</p>
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Progress value={p.progress.percent} size="sm" className="flex-1" />
                    <span className="text-xs font-semibold tabular">{pct(p.progress.percent)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      {p.progress.completed}/{p.progress.total} componentes
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" /> {p.memberCount}
                    </span>
                    <span>Objetivo {formatDate(p.targetDate)}</span>
                    <span className="ml-auto tabular">{formatMoney(p.budget, p.currency, { compact: true })}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateProject();
  const [form, setForm] = React.useState({ name: '', competition: '', description: '', startDate: '', targetDate: '', budget: '', currency: 'CRC' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        name: form.name.trim(),
        competition: strOrNull(form.competition),
        description: strOrNull(form.description),
        status: 'planning',
        startDate: strOrNull(form.startDate),
        targetDate: strOrNull(form.targetDate),
        budget: numOrNull(form.budget),
        currency: form.currency.trim().toUpperCase() || 'CRC',
      },
      {
        onSuccess: (p) => {
          toast.success('Proyecto creado. Ahora agrega sistemas y miembros.');
          onOpenChange(false);
          navigate(`/p/${p.id}/settings`);
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
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>Después podrás definir sistemas, miembros, hitos y presupuesto por sistema.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="IREC 2028" required autoFocus />
            </Field>
            <Field label="Competencia / evento" className="sm:col-span-2">
              <Input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })} placeholder="Spaceport America Cup 2028" />
            </Field>
            <Field label="Fecha de inicio">
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="Fecha objetivo">
              <Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </Field>
            <Field label="Presupuesto">
              <Input type="number" min={0} step="any" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </Field>
            <Field label="Moneda" hint="Código ISO: CRC, USD…">
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={5} className="font-mono uppercase" />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Crear proyecto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
