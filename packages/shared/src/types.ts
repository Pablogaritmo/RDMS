import type {
  ActivityAction,
  ComponentStatus,
  EntityType,
  ManufacturingProcess,
  MaterialStatus,
  MembershipRole,
  Priority,
  ProjectStatus,
  UserRole,
} from './constants.js';

// Dates are ISO `YYYY-MM-DD` strings; timestamps are ISO 8601 strings.

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface User extends UserSummary {
  role: UserRole;
  createdAt: string;
}

export interface SessionUser extends User {
  /** Projects where the user is a member, with role. Admins get all projects. */
  memberships: { projectId: string; role: MembershipRole }[];
  systemLeadIds: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  competition: string | null;
  status: ProjectStatus;
  startDate: string | null;
  targetDate: string | null;
  budget: number | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember extends UserSummary {
  role: MembershipRole;
}

export interface SystemMember extends UserSummary {
  role: MembershipRole;
}

export interface System {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description: string | null;
  budget: number | null;
  sortOrder: number;
  members: SystemMember[];
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  date: string;
  description: string | null;
  completedAt: string | null;
}

export interface Manufacturing {
  process: ManufacturingProcess | null;
  machine: string | null;
  workshop: string | null;
  setupMinutes: number;
  machineMinutes: number;
  finishingMinutes: number;
  inspectionMinutes: number;
  responsibleId: string | null;
  scheduledDate: string | null;
  actualDate: string | null;
  needsWorkshop: boolean;
  needsExternal: boolean;
  notes: string | null;
}

export interface Component {
  id: string;
  projectId: string;
  systemId: string;
  code: string;
  name: string;
  description: string | null;
  subsystem: string | null;
  quantity: number;
  responsibleId: string | null;
  priority: Priority;
  status: ComponentStatus;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  material: string | null;
  materialQty: number | null;
  materialUnit: string | null;
  supplier: string | null;
  materialStatus: MaterialStatus | null;
  designerId: string | null;
  designApprovedAt: string | null;
  designNotes: string | null;
  estMaterialCost: number;
  estManufacturingCost: number;
  estPurchaseCost: number;
  estOtherCost: number;
  actualCost: number | null;
  createdAt: string;
  updatedAt: string;
  collaboratorIds: string[];
  /** ids of components this one depends on */
  dependsOn: string[];
  /** ids of components depending on this one */
  dependents: string[];
  manufacturing: Manufacturing | null;
}

export interface Dependency {
  componentId: string;
  dependsOnId: string;
}

export interface ActivityChange {
  field: string;
  from: unknown;
  to: unknown;
  fromLabel?: string | null;
  toLabel?: string | null;
}

export interface ActivityLog {
  id: string;
  projectId: string;
  entityType: EntityType;
  entityId: string;
  entityLabel: string | null;
  userId: string | null;
  userName: string | null;
  action: ActivityAction;
  changes: ActivityChange[] | null;
  note: string | null;
  createdAt: string;
}

export interface ProjectBundle {
  project: Project;
  members: ProjectMember[];
  systems: System[];
  components: Component[];
  milestones: Milestone[];
}

export interface SearchResult {
  type: 'component' | 'system' | 'user' | 'project' | 'milestone';
  id: string;
  title: string;
  subtitle: string | null;
  projectId: string | null;
}
