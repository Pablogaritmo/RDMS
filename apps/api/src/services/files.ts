import type { FileItem, FileMetaInput } from '@rdms/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { db, schema, type DbOrTx } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import type { AuthUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { canEditComponent, canManageProject, canManageSystem, type ProjectAccess } from '../lib/permissions.js';
import { serializeFile } from '../lib/serialize.js';
import { env } from '../env.js';
import { getComponentOrThrow } from './components.js';
import { getTestOrThrow } from './tests.js';

// ---------------------------------------------------------------------------
// Storage adapter. Local disk by default; swap `storage` for an S3-compatible
// implementation (Supabase Storage, R2, S3) without touching the routes.
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  open(key: string): Promise<{ stream: ReadableStream; size: number }>;
  remove(key: string): Promise<void>;
}

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

const localDisk: StorageAdapter = {
  async save(key, data) {
    const full = path.join(uploadRoot, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  async open(key) {
    const full = path.join(uploadRoot, key);
    const info = await stat(full).catch(() => null);
    if (!info) throw notFound('El archivo ya no existe en el servidor');
    return { stream: Readable.toWeb(createReadStream(full)) as ReadableStream, size: info.size };
  },
  async remove(key) {
    await unlink(path.join(uploadRoot, key)).catch(() => undefined);
  },
};

export const storage: StorageAdapter = localDisk;

// ---------------------------------------------------------------------------

export async function loadFiles(projectId: string, tx: DbOrTx = db): Promise<FileItem[]> {
  const rows = await tx.select().from(schema.files).where(eq(schema.files.projectId, projectId)).orderBy(schema.files.createdAt);
  return rows.map(serializeFile);
}

export async function getFileRowOrThrow(projectId: string, fileId: string, tx: DbOrTx = db) {
  const [row] = await tx
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.projectId, projectId)))
    .limit(1);
  if (!row) throw notFound('Archivo no encontrado');
  return row;
}

const sanitizeName = (name: string) =>
  name
    .replace(/[/\\]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 150) || 'archivo';

/** Who may attach files to an entity: whoever may edit it. Returns a label for the activity log. */
async function assertCanAttach(user: AuthUser, access: ProjectAccess, projectId: string, meta: FileMetaInput): Promise<string> {
  switch (meta.entityType) {
    case 'component': {
      const c = await getComponentOrThrow(projectId, meta.entityId);
      if (!canEditComponent(access, user.id, c)) throw forbidden('No puedes adjuntar archivos a este componente');
      return `${c.code} ${c.name}`;
    }
    case 'test': {
      const t = await getTestOrThrow(projectId, meta.entityId);
      const ok = canManageProject(access) || (t.systemId ? canManageSystem(access, t.systemId) : false) || t.responsibleId === user.id;
      if (!ok) throw forbidden('No puedes adjuntar archivos a esta prueba');
      return t.name;
    }
    case 'inspection': {
      const [i] = await db.select().from(schema.inspections).where(eq(schema.inspections.id, meta.entityId)).limit(1);
      if (!i) throw notFound('Inspección no encontrada');
      const c = await getComponentOrThrow(projectId, i.componentId);
      if (i.inspectorId !== user.id && !canManageSystem(access, c.systemId)) throw forbidden('Solo el inspector o un líder puede adjuntar archivos');
      return `Inspección ${c.code}`;
    }
    case 'project':
      if (meta.entityId !== projectId) throw badRequest('Entidad inválida');
      if (!canManageProject(access)) throw forbidden('Solo los líderes pueden adjuntar archivos al proyecto');
      return 'proyecto';
  }
}

export async function uploadFile(user: AuthUser, access: ProjectAccess, projectId: string, meta: FileMetaInput, file: File): Promise<FileItem> {
  const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size === 0) throw badRequest('El archivo está vacío');
  if (file.size > maxBytes) throw badRequest(`El archivo supera el máximo de ${env.MAX_FILE_SIZE_MB} MB`);
  const label = await assertCanAttach(user, access, projectId, meta);
  const name = sanitizeName(file.name);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.files)
      .values({
        projectId,
        entityType: meta.entityType,
        entityId: meta.entityId,
        category: meta.category,
        name,
        storageKey: 'pending',
        mime: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: user.id,
      })
      .returning();
    const key = path.posix.join(projectId, `${row.id}${path.extname(name).toLowerCase().slice(0, 12)}`);
    await storage.save(key, Buffer.from(await file.arrayBuffer()));
    await tx.update(schema.files).set({ storageKey: key }).where(eq(schema.files.id, row.id));
    await logActivity(
      {
        projectId,
        entityType: meta.entityType === 'project' ? 'project' : meta.entityType,
        entityId: meta.entityId,
        entityLabel: label,
        userId: user.id,
        action: 'file_added',
        changes: [{ field: 'file', from: null, to: row.id, toLabel: name }],
      },
      tx,
    );
    return serializeFile({ ...row, storageKey: key });
  });
}

export async function deleteFile(user: AuthUser, access: ProjectAccess, projectId: string, fileId: string) {
  const row = await getFileRowOrThrow(projectId, fileId);
  let allowed = canManageProject(access) || row.uploadedBy === user.id;
  if (!allowed && row.entityType === 'component') {
    const c = await getComponentOrThrow(projectId, row.entityId).catch(() => null);
    allowed = !!c && canEditComponent(access, user.id, c);
  }
  if (!allowed) throw forbidden('Solo quien subió el archivo o un líder puede eliminarlo');
  await db.transaction(async (tx) => {
    await tx.delete(schema.files).where(eq(schema.files.id, row.id));
    await logActivity(
      {
        projectId,
        entityType: row.entityType === 'project' ? 'project' : (row.entityType as 'component' | 'test' | 'inspection'),
        entityId: row.entityId,
        entityLabel: null,
        userId: user.id,
        action: 'file_removed',
        changes: [{ field: 'file', from: row.id, to: null, fromLabel: row.name }],
      },
      tx,
    );
  });
  await storage.remove(row.storageKey);
}

/** Removes stored blobs for files that belong to deleted entities (called after component deletion). */
export async function removeFilesForEntities(entityIds: string[]) {
  if (entityIds.length === 0) return;
  const rows = await db.select().from(schema.files).where(inArray(schema.files.entityId, entityIds));
  if (rows.length === 0) return;
  await db.delete(schema.files).where(inArray(schema.files.id, rows.map((r) => r.id)));
  await Promise.all(rows.map((r) => storage.remove(r.storageKey)));
}
