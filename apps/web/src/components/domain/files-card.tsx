import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProject } from '@/hooks/use-project';
import { formatDate } from '@/lib/format';
import { fileDownloadUrl, useDeleteFile, useUploadFile } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { FILE_CATEGORIES, MAX_FILE_SIZE_MB, type FileCategory, type FileEntityType, type FileItem } from '@rdms/shared';
import { Box, Camera, Download, FileText, FlaskConical, Image as ImageIcon, Paperclip, Ruler, Trash2, Upload, Wrench } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ className?: string }>> = {
  drawing: Ruler,
  cad: Box,
  datasheet: FileText,
  photo: Camera,
  manufacturing: Wrench,
  test_result: FlaskConical,
  other: Paperclip,
};

export function formatBytes(n: number | null | undefined): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  entityType: FileEntityType;
  entityId: string;
  canEdit: boolean;
  title?: string;
  description?: string;
  /** default category for the upload button */
  defaultCategory?: FileCategory;
  compact?: boolean;
}

/** Attachments of an entity (drawings, CAD, photos, datasheets…). Files live on the server disk. */
export function FilesCard({ entityType, entityId, canEdit, title = 'Archivos y planos', description, defaultCategory = 'drawing', compact }: Props) {
  const { project, files, usersById } = useProject();
  const upload = useUploadFile(project.id);
  const remove = useDeleteFile(project.id);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [category, setCategory] = React.useState<FileCategory>(defaultCategory);
  const [dragging, setDragging] = React.useState(false);

  const list = React.useMemo(() => files.filter((f) => f.entityType === entityType && f.entityId === entityId).sort((a, b) => a.category.localeCompare(b.category) || b.createdAt.localeCompare(a.createdAt)), [files, entityType, entityId]);

  const send = (fileList: FileList | File[] | null, cat: FileCategory = category) => {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name} supera ${MAX_FILE_SIZE_MB} MB`);
        continue;
      }
      upload.mutate(
        { file, entityType, entityId, category: cat },
        { onSuccess: (f) => toast.success(`${f.name} subido`), onError: (e) => toast.error(e.message) },
      );
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = (cat: FileCategory) => {
    setCategory(cat);
    // let state settle, then open the picker
    setTimeout(() => inputRef.current?.click(), 0);
  };

  const drawings = list.filter((f) => f.category === 'drawing').length;

  return (
    <Card
      className={cn(dragging && 'ring-2 ring-primary/40')}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragging(false);
        send(e.dataTransfer.files);
      }}
    >
      <CardHeader className={cn(compact && 'px-3 pt-2.5 pb-1')}>
        <div className="min-w-0">
          <CardTitle className={cn('flex items-center gap-2', compact && 'text-xs')}>
            <Paperclip className={cn('size-4 text-muted-foreground', compact && 'size-3.5')} /> {title}
            {list.length ? (
              <span className="text-xs font-normal text-muted-foreground">
                {list.length} archivo(s){drawings ? ` · ${drawings} plano(s)` : ''}
              </span>
            ) : null}
          </CardTitle>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" loading={upload.isPending}>
                <Upload /> Subir
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>¿Qué vas a subir?</DropdownMenuLabel>
              {FILE_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c.key];
                return (
                  <DropdownMenuItem key={c.key} onSelect={() => pick(c.key)}>
                    <Icon className="text-muted-foreground" /> {c.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => send(e.target.files)} />
      </CardHeader>
      <CardContent className={cn(compact && 'px-3 pb-2.5')}>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {compact ? (canEdit ? 'Sin archivos. Arrastra aquí o usa «Subir».' : 'Sin archivos.') : canEdit ? `Sin archivos. Arrastra aquí o usa «Subir» para adjuntar planos, CAD, fotos o datasheets (máx. ${MAX_FILE_SIZE_MB} MB).` : 'Sin archivos adjuntos.'}
          </p>
        ) : (
          <ul className={cn('grid gap-1.5', !compact && 'sm:grid-cols-2')}>
            {list.map((f) => (
              <FileRow key={f.id} file={f} projectId={project.id} uploader={f.uploadedById ? usersById.get(f.uploadedById)?.name : undefined} onDelete={canEdit ? () => remove.mutate(f.id, { onSuccess: () => toast.success('Archivo eliminado'), onError: (e) => toast.error(e.message) }) : undefined} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function FileRow({ file, projectId, uploader, onDelete }: { file: FileItem; projectId: string; uploader?: string; onDelete?: () => void }) {
  const Icon = file.mime?.startsWith('image/') ? ImageIcon : CATEGORY_ICON[file.category];
  const cat = FILE_CATEGORIES.find((c) => c.key === file.category);
  const previewable = file.mime?.startsWith('image/') || file.mime === 'application/pdf';
  return (
    <li className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <a href={fileDownloadUrl(projectId, file.id, previewable)} target={previewable ? '_blank' : undefined} rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline" title={file.name}>
        {file.name}
      </a>
      <Badge variant={file.category === 'drawing' ? 'info' : 'muted'} className="shrink-0">
        {cat?.label ?? file.category}
      </Badge>
      <span className="hidden shrink-0 text-muted-foreground sm:inline" title={uploader ? `Subido por ${uploader}` : undefined}>
        {formatBytes(file.size)} · {formatDate(file.createdAt)}
      </span>
      <a href={fileDownloadUrl(projectId, file.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Descargar" download>
        <Download className="size-3.5" />
      </a>
      {onDelete ? (
        <button type="button" onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer" title="Eliminar">
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}
