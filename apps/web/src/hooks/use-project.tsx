import { useBundle, useMe, useUsers } from '@/lib/queries';
import {
  computeBlocking,
  isDueSoon,
  isOverdue,
  todayISO,
  type BlockInfo,
  type Component,
  type FileItem,
  type Inspection,
  type Milestone,
  type Project,
  type ProjectMember,
  type Purchase,
  type SessionUser,
  type System,
  type Test,
  type UserSummary,
} from '@rdms/shared';
import * as React from 'react';

export interface ProjectData {
  project: Project;
  members: ProjectMember[];
  systems: System[];
  components: Component[];
  milestones: Milestone[];
  purchases: Purchase[];
  tests: Test[];
  inspections: Inspection[];
  files: FileItem[];
  today: string;
  componentsById: Map<string, Component>;
  systemsById: Map<string, System>;
  usersById: Map<string, UserSummary>;
  blocking: Map<string, BlockInfo>;
  user: SessionUser;
  /** permission helpers (UI only — the API enforces the real rules) */
  isAdmin: boolean;
  canManageProject: boolean;
  canManageSystem: (systemId: string) => boolean;
  canCreateIn: (systemId: string) => boolean;
  canEdit: (c: Component) => boolean;
  isBlocked: (c: Component) => boolean;
  isOverdue: (c: Component) => boolean;
  isDueSoon: (c: Component) => boolean;
  isMine: (c: Component) => boolean;
  refetch: () => void;
}

const ProjectContext = React.createContext<ProjectData | null>(null);

export function ProjectProvider({ projectId, children, fallback }: { projectId: string; children: React.ReactNode; fallback: (state: { isLoading: boolean; error: Error | null }) => React.ReactNode }) {
  const me = useMe();
  const bundle = useBundle(projectId);
  const users = useUsers();
  const refetchBundle = bundle.refetch;

  const value = React.useMemo<ProjectData | null>(() => {
    if (!bundle.data || !me.data) return null;
    const { project, members, systems, components, milestones, purchases, tests, inspections, files } = bundle.data;
    const user = me.data;
    const today = todayISO();
    const componentsById = new Map(components.map((c) => [c.id, c]));
    const systemsById = new Map(systems.map((s) => [s.id, s]));
    const usersById = new Map<string, UserSummary>();
    for (const u of users.data ?? []) usersById.set(u.id, u);
    for (const m of members) usersById.set(m.id, m);
    const blocking = computeBlocking(components);

    const isAdmin = user.role === 'admin';
    const membership = user.memberships.find((m) => m.projectId === projectId);
    const canManageProject = isAdmin || membership?.role === 'lead';
    const leadSet = new Set(user.systemLeadIds);
    const memberSystemIds = new Set(systems.filter((s) => s.members.some((m) => m.id === user.id)).map((s) => s.id));
    const canManageSystem = (systemId: string) => canManageProject || leadSet.has(systemId);
    const canCreateIn = (systemId: string) => canManageSystem(systemId) || (!!membership && memberSystemIds.has(systemId));
    const canEdit = (c: Component) => canManageSystem(c.systemId) || c.responsibleId === user.id || c.collaboratorIds.includes(user.id);
    const isMine = (c: Component) => c.responsibleId === user.id || c.collaboratorIds.includes(user.id);

    return {
      project,
      members,
      systems,
      components,
      milestones,
      purchases,
      tests,
      inspections,
      files,
      today,
      componentsById,
      systemsById,
      usersById,
      blocking,
      user,
      isAdmin,
      canManageProject,
      canManageSystem,
      canCreateIn,
      canEdit,
      isMine,
      isBlocked: (c) => (blocking.get(c.id)?.blockedBy.length ?? 0) > 0,
      isOverdue: (c) => isOverdue(c, today),
      isDueSoon: (c) => isDueSoon(c, today),
      refetch: () => void refetchBundle(),
    };
  }, [bundle.data, me.data, users.data, projectId, refetchBundle]);

  if (!value) return <>{fallback({ isLoading: bundle.isLoading || me.isLoading, error: (bundle.error as Error | null) ?? (me.error as Error | null) })}</>;
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectData {
  const ctx = React.useContext(ProjectContext);
  if (!ctx) throw new Error('useProject debe usarse dentro de ProjectProvider');
  return ctx;
}

export function useProjectOptional(): ProjectData | null {
  return React.useContext(ProjectContext);
}
