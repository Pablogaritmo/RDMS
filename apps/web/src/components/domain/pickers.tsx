import { StatusBadge } from '@/components/domain/badges';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Component, UserSummary } from '@rdms/shared';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import * as React from 'react';

interface UserPickerProps {
  users: UserSummary[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'default';
}

export function UserPicker({ users, value, onChange, placeholder = 'Seleccionar persona', allowClear = true, disabled, className, size = 'default' }: UserPickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = users.find((u) => u.id === value) ?? null;
  const list = React.useMemo(() => users.filter((u) => u.isActive || u.id === value).sort((a, b) => a.name.localeCompare(b.name)), [users, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} size={size} className={cn('justify-between font-normal', !selected && 'text-muted-foreground', className)}>
          <span className="flex min-w-0 items-center gap-2">
            {selected ? <Avatar user={selected} size="xs" /> : null}
            <span className="truncate">{selected ? selected.name : placeholder}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar persona…" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {allowClear && selected ? (
                <CommandItem
                  value="__clear"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <X /> Sin asignar
                </CommandItem>
              ) : null}
              {list.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.name} ${u.email}`}
                  onSelect={() => {
                    onChange(u.id);
                    setOpen(false);
                  }}
                >
                  <Avatar user={u} size="xs" />
                  <span className={cn('truncate', !u.isActive && 'line-through text-muted-foreground')}>{u.name}</span>
                  {u.id === value ? <Check className="ml-auto size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ComponentPickerProps {
  components: Component[];
  exclude?: Set<string>;
  onSelect: (component: Component) => void;
  trigger: React.ReactNode;
  systemsById?: Map<string, { code: string }>;
}

export function ComponentPicker({ components, exclude, onSelect, trigger, systemsById }: ComponentPickerProps) {
  const [open, setOpen] = React.useState(false);
  const list = React.useMemo(() => components.filter((c) => !exclude?.has(c.id)).sort((a, b) => a.code.localeCompare(b.code)), [components, exclude]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Buscar por código o nombre…" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {list.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.code} ${c.name} ${systemsById?.get(c.systemId)?.code ?? ''}`}
                  onSelect={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                >
                  <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                  <StatusBadge status={c.status} className="ml-auto" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
