import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useProjectOptional } from '@/hooks/use-project';
import { useSearch } from '@/lib/queries';
import { fileDownloadUrl } from '@/lib/queries';
import { FILE_CATEGORIES, STATUS_BY_KEY, type ComponentStatus, type SearchResult } from '@rdms/shared';
import { Box, Flag, FolderKanban, Layers, Paperclip, ShoppingCart, User } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';

const ICONS: Record<SearchResult['type'], React.ComponentType<{ className?: string }>> = {
  component: Box,
  system: Layers,
  project: FolderKanban,
  user: User,
  milestone: Flag,
  purchase: ShoppingCart,
  file: Paperclip,
};
const GROUPS: { type: SearchResult['type']; label: string }[] = [
  { type: 'component', label: 'Componentes' },
  { type: 'system', label: 'Sistemas' },
  { type: 'purchase', label: 'Compras' },
  { type: 'file', label: 'Archivos' },
  { type: 'milestone', label: 'Hitos' },
  { type: 'project', label: 'Proyectos' },
  { type: 'user', label: 'Usuarios' },
];

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [q, setQ] = React.useState('');
  const project = useProjectOptional();
  const navigate = useNavigate();
  const search = useSearch(q, project?.project.id);

  React.useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const go = (r: SearchResult) => {
    onOpenChange(false);
    const pid = r.projectId ?? project?.project.id;
    switch (r.type) {
      case 'component':
        navigate(`/p/${pid}/components/${r.id}`);
        break;
      case 'system':
        navigate(`/p/${pid}/systems/${r.id}`);
        break;
      case 'project':
        navigate(`/p/${r.id}`);
        break;
      case 'milestone':
        navigate(`/p/${pid}/schedule`);
        break;
      case 'user':
        navigate(project ? `/p/${project.project.id}/components?responsible=${r.id}` : '/users');
        break;
      case 'purchase':
        navigate(`/p/${pid}/purchases`);
        break;
      case 'file':
        if (r.entityType === 'component' && r.entityId) navigate(`/p/${pid}/components/${r.entityId}`);
        else if (r.entityType === 'test' && r.entityId) navigate(`/p/${pid}/tests?test=${r.entityId}`);
        else if (pid) window.open(fileDownloadUrl(pid, r.id, true), '_blank');
        break;
    }
  };

  const results = search.data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 gap-0 p-0 overflow-hidden" size="md">
        <DialogTitle className="sr-only">Búsqueda global</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar componentes, sistemas, usuarios…" value={q} onValueChange={setQ} autoFocus />
          <CommandList>
            {q.trim().length < 2 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Escribe al menos 2 caracteres</p>
            ) : search.isLoading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Buscando…</p>
            ) : (
              <>
                {results.length === 0 ? <CommandEmpty>Sin resultados para «{q}»</CommandEmpty> : null}
                {GROUPS.map((g) => {
                  const items = results.filter((r) => r.type === g.type);
                  if (items.length === 0) return null;
                  const Icon = ICONS[g.type];
                  return (
                    <CommandGroup key={g.type} heading={g.label}>
                      {items.map((r) => (
                        <CommandItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r)}>
                          <Icon className="text-muted-foreground" />
                          <span className="truncate">{r.title}</span>
                          {r.subtitle ? (
                            <span className="ml-auto truncate text-xs text-muted-foreground">
                              {r.type === 'component' ? (STATUS_BY_KEY[r.subtitle as ComponentStatus]?.label ?? r.subtitle) : r.type === 'file' ? (FILE_CATEGORIES.find((c) => c.key === r.subtitle)?.label ?? r.subtitle) : r.subtitle}
                            </span>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
