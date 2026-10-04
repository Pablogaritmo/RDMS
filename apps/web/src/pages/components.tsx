import { ComponentFormDialog } from '@/components/domain/component-form';
import { ComponentTable } from '@/components/domain/component-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/misc';
import { useProject } from '@/hooks/use-project';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { COMPONENT_STATUSES, estimatedCost, isDone, MATERIAL_STATUSES, PRIORITIES, type Component } from '@rdms/shared';
import { Ban, ChevronDown, Clock, Factory, Filter, GitFork, Plus, Search, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router';
import { formatMoney } from '@/lib/format';

type Flag = 'overdue' | 'blocked' | 'blocking' | 'due_soon' | 'open' | 'done' | 'workshop';
const FLAGS: { key: Flag; label: string; icon?: React.ComponentType<{ className?: string }>; title?: string }[] = [
  { key: 'open', label: 'Abiertos' },
  { key: 'overdue', label: 'Atrasados', icon: TriangleAlert },
  { key: 'blocked', label: 'Bloqueados', icon: Ban },
  { key: 'blocking', label: 'Cuellos de botella', icon: GitFork, title: 'Componentes que bloquean a otros, ordenados por cuántos bloquean' },
  { key: 'due_soon', label: 'Vencen pronto', icon: Clock },
  { key: 'workshop', label: 'Taller', icon: Factory, title: 'Pendientes o en fabricación' },
  { key: 'done', label: 'Completados' },
];

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function ComponentsPage() {
  const data = useProject();
  const { project, components, systems, members, usersById, systemsById, canCreateIn } = data;
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = React.useState(false);

  const q = params.get('q') ?? '';
  const systemIds = list(params.get('system'));
  const responsibles = list(params.get('responsible'));
  const statuses = list(params.get('status'));
  const priorities = list(params.get('priority'));
  const materials = list(params.get('material'));
  const flag = (params.get('flag') as Flag | null) ?? null;
  const before = params.get('before');

  const update = (key: string, value: string | string[] | null) => {
    const next = new URLSearchParams(params);
    const v = Array.isArray(value) ? value.join(',') : value;
    if (!v) next.delete(key);
    else next.set(key, v);
    setParams(next, { replace: true });
  };
  const toggleIn = (key: string, current: string[], value: string) => update(key, current.includes(value) ? current.filter((x) => x !== value) : [...current, value]);
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  const activeCount = [systemIds.length, responsibles.length, statuses.length, priorities.length, materials.length, flag ? 1 : 0, before ? 1 : 0, q ? 1 : 0].filter(Boolean).length;

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return components.filter((c: Component) => {
      if (needle && !`${c.code} ${c.name} ${c.material ?? ''} ${c.description ?? ''} ${c.subsystem ?? ''}`.toLowerCase().includes(needle)) return false;
      if (systemIds.length && !systemIds.includes(c.systemId)) return false;
      if (responsibles.length) {
        const matchNone = responsibles.includes('none') && !c.responsibleId;
        const matchUser = !!c.responsibleId && responsibles.includes(c.responsibleId);
        const matchCollab = responsibles.some((r) => c.collaboratorIds.includes(r));
        if (!matchNone && !matchUser && !matchCollab) return false;
      }
      if (statuses.length && !statuses.includes(c.status)) return false;
      if (priorities.length && !priorities.includes(c.priority)) return false;
      if (materials.length && !materials.includes(c.materialStatus ?? '')) return false;
      if (before && (!c.dueDate || c.dueDate > before)) return false;
      if (flag === 'overdue' && !data.isOverdue(c)) return false;
      if (flag === 'blocked' && !data.isBlocked(c)) return false;
      if (flag === 'blocking' && (data.blocking.get(c.id)?.blocking.length ?? 0) === 0) return false;
      if (flag === 'workshop' && !['pending_manufacturing', 'in_manufacturing'].includes(c.status)) return false;
      if (flag === 'due_soon' && !data.isDueSoon(c)) return false;
      if (flag === 'open' && isDone(c)) return false;
      if (flag === 'done' && !isDone(c)) return false;
      return true;
    });
  }, [components, q, systemIds, responsibles, statuses, priorities, materials, before, flag, data]);

  const totalEst = filtered.reduce((acc, c) => acc + estimatedCost(c), 0);
  const canCreateAnywhere = systems.some((s) => canCreateIn(s.id));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Componentes"
        description={
          <>
            {filtered.length} de {components.length} · costo estimado {formatMoney(totalEst, project.currency)}
          </>
        }
        actions={
          canCreateAnywhere ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Nuevo componente
            </Button>
          ) : null
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => update('q', e.target.value)} placeholder="Buscar código, nombre, material…" className="pl-8" />
          </div>

          <FilterMenu label="Sistema" count={systemIds.length}>
            {systems.map((s) => (
              <DropdownMenuCheckboxItem key={s.id} checked={systemIds.includes(s.id)} onCheckedChange={() => toggleIn('system', systemIds, s.id)} onSelect={(e) => e.preventDefault()}>
                <span className="font-mono text-xs text-muted-foreground w-9">{s.code}</span> {s.name}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>

          <FilterMenu label="Responsable" count={responsibles.length}>
            <DropdownMenuCheckboxItem checked={responsibles.includes(data.user.id)} onCheckedChange={() => toggleIn('responsible', responsibles, data.user.id)} onSelect={(e) => e.preventDefault()}>
              Mis componentes
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={responsibles.includes('none')} onCheckedChange={() => toggleIn('responsible', responsibles, 'none')} onSelect={(e) => e.preventDefault()}>
              Sin asignar
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {members
              .filter((m) => m.id !== data.user.id)
              .map((m) => (
                <DropdownMenuCheckboxItem key={m.id} checked={responsibles.includes(m.id)} onCheckedChange={() => toggleIn('responsible', responsibles, m.id)} onSelect={(e) => e.preventDefault()}>
                  <span className={cn(!m.isActive && 'line-through text-muted-foreground')}>{m.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
          </FilterMenu>

          <FilterMenu label="Estado" count={statuses.length}>
            {COMPONENT_STATUSES.map((s) => (
              <DropdownMenuCheckboxItem key={s.key} checked={statuses.includes(s.key)} onCheckedChange={() => toggleIn('status', statuses, s.key)} onSelect={(e) => e.preventDefault()}>
                {s.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>

          <FilterMenu label="Prioridad" count={priorities.length}>
            {PRIORITIES.map((p) => (
              <DropdownMenuCheckboxItem key={p.key} checked={priorities.includes(p.key)} onCheckedChange={() => toggleIn('priority', priorities, p.key)} onSelect={(e) => e.preventDefault()}>
                {p.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>

          <FilterMenu label="Material" count={materials.length}>
            <DropdownMenuLabel>Disponibilidad</DropdownMenuLabel>
            {MATERIAL_STATUSES.map((m) => (
              <DropdownMenuCheckboxItem key={m.key} checked={materials.includes(m.key)} onCheckedChange={() => toggleIn('material', materials, m.key)} onSelect={(e) => e.preventDefault()}>
                {m.label}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:inline">Vence antes de</span>
            <Input type="date" value={before ?? ''} onChange={(e) => update('before', e.target.value || null)} className="h-8 w-[150px] text-xs" aria-label="Vence antes de" />
          </div>

          {activeCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
              <X /> Limpiar ({activeCount})
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FLAGS.map((f) => {
            const active = flag === f.key;
            return (
              <button
                key={f.key}
                type="button"
                title={f.title}
                onClick={() => update('flag', active ? null : f.key)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors cursor-pointer hover:bg-accent',
                  active && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                  !active && f.key === 'overdue' && 'text-red-700',
                  !active && f.key === 'blocked' && 'text-red-700',
                  !active && f.key === 'due_soon' && 'text-amber-700',
                )}
              >
                {f.icon ? <f.icon className="size-3" /> : null}
                {f.label}
              </button>
            );
          })}
          {/* active filter summary chips */}
          {systemIds.map((id) => (
            <Chip key={id} onRemove={() => toggleIn('system', systemIds, id)}>
              {systemsById.get(id)?.name ?? 'Sistema'}
            </Chip>
          ))}
          {responsibles.map((id) => (
            <Chip key={id} onRemove={() => toggleIn('responsible', responsibles, id)}>
              {id === 'none' ? 'Sin asignar' : (usersById.get(id)?.name ?? 'Persona')}
            </Chip>
          ))}
          {before ? <Chip onRemove={() => update('before', null)}>antes de {formatDate(before)}</Chip> : null}
        </div>
      </div>

      <ComponentTable
        key={flag ?? 'all'}
        components={filtered}
        defaultSort={flag === 'blocking' ? { key: 'blocking', dir: 'desc' } : flag === 'overdue' || flag === 'due_soon' ? { key: 'dueDate', dir: 'asc' } : undefined}
        emptyTitle={components.length === 0 ? 'Todavía no hay componentes' : 'Ningún componente coincide con los filtros'}
        emptyDescription={components.length === 0 ? 'Crea el primer componente del cohete: una pieza, un ensamble o una tarea de ingeniería.' : undefined}
        emptyAction={
          components.length === 0 && canCreateAnywhere ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Nuevo componente
            </Button>
          ) : activeCount > 0 ? (
            <Button variant="outline" size="sm" onClick={clearAll}>
              Limpiar filtros
            </Button>
          ) : undefined
        }
      />

      <ComponentFormDialog open={createOpen} onOpenChange={setCreateOpen} defaultSystemId={systemIds[0]} />
    </div>
  );
}

function FilterMenu({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('font-normal', count > 0 && 'border-primary/40 bg-primary/5')}>
          <Filter className="size-3.5 text-muted-foreground" />
          {label}
          {count > 0 ? (
            <Badge variant="default" className="px-1 py-0 text-[10px]">
              {count}
            </Badge>
          ) : null}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs">
      {children}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-background cursor-pointer" aria-label="Quitar filtro">
        <X className="size-3" />
      </button>
    </span>
  );
}
