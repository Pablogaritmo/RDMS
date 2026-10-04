import type { Milestone, ProjectBundle, ProjectMember, System } from '@rdms/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { serializeMilestone, serializeProject, serializeUserSummary } from '../lib/serialize.js';
import { loadComponents } from './components.js';

export async function loadProjectMembers(projectId: string, tx: DbOrTx = db): Promise<ProjectMember[]> {
  const rows = await tx
    .select({ user: schema.users, role: schema.projectMembers.role })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
    .where(eq(schema.projectMembers.projectId, projectId))
    .orderBy(asc(schema.projectMembers.role), asc(schema.users.name));
  return rows.map((r) => ({ ...serializeUserSummary(r.user), role: r.role as ProjectMember['role'] }));
}

export async function loadSystems(projectId: string, tx: DbOrTx = db, systemId?: string): Promise<System[]> {
  const where = systemId ? eq(schema.systems.id, systemId) : eq(schema.systems.projectId, projectId);
  const rows = await tx.select().from(schema.systems).where(where).orderBy(asc(schema.systems.sortOrder), asc(schema.systems.name));
  if (rows.length === 0) return [];
  const members = await tx
    .select({ systemId: schema.systemMembers.systemId, role: schema.systemMembers.role, user: schema.users })
    .from(schema.systemMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.systemMembers.userId))
    .where(inArray(schema.systemMembers.systemId, rows.map((r) => r.id)))
    .orderBy(asc(schema.systemMembers.role), asc(schema.users.name));
  const bySystem = new Map<string, System['members']>();
  for (const m of members) {
    bySystem.set(m.systemId, [...(bySystem.get(m.systemId) ?? []), { ...serializeUserSummary(m.user), role: m.role as 'lead' | 'member' }]);
  }
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    code: r.code,
    name: r.name,
    description: r.description,
    budget: r.budget,
    sortOrder: r.sortOrder,
    members: bySystem.get(r.id) ?? [],
  }));
}

export async function loadMilestones(projectId: string, tx: DbOrTx = db): Promise<Milestone[]> {
  const rows = await tx.select().from(schema.milestones).where(eq(schema.milestones.projectId, projectId)).orderBy(asc(schema.milestones.date));
  return rows.map(serializeMilestone);
}

export async function loadProjectBundle(projectId: string): Promise<ProjectBundle> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
  if (!project) throw notFound('Proyecto no encontrado');
  const [members, systems, components, milestones] = await Promise.all([
    loadProjectMembers(projectId),
    loadSystems(projectId),
    loadComponents(projectId),
    loadMilestones(projectId),
  ]);
  return { project: serializeProject(project), members, systems, components, milestones };
}
