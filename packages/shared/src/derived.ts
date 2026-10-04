import { DUE_SOON_DAYS, isDoneStatus, STATUS_BY_KEY, statusOrder, type ComponentStatus } from './constants.js';
import type { Component, Manufacturing } from './types.js';

// ---------------------------------------------------------------------------
// Pure helpers. Everything here is DERIVED from stored data and never persisted.
// ---------------------------------------------------------------------------

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

type Lifecycle = Pick<Component, 'status' | 'dueDate'>;

export function isDone(c: Pick<Component, 'status'>): boolean {
  return isDoneStatus(c.status);
}

export function isOverdue(c: Lifecycle, today: string = todayISO()): boolean {
  return !isDone(c) && !!c.dueDate && c.dueDate < today;
}

export function isDueSoon(c: Lifecycle, today: string = todayISO(), days: number = DUE_SOON_DAYS): boolean {
  if (isDone(c) || !c.dueDate) return false;
  return c.dueDate >= today && c.dueDate <= addDaysISO(today, days);
}

export function statusProgress(status: ComponentStatus): number {
  return STATUS_BY_KEY[status].progress;
}

export interface ProgressSummary {
  total: number;
  completed: number;
  /** Weighted by status progress (0-100). */
  percent: number;
}

export function computeProgress(components: Pick<Component, 'status'>[]): ProgressSummary {
  const total = components.length;
  if (total === 0) return { total: 0, completed: 0, percent: 0 };
  const completed = components.filter(isDone).length;
  const sum = components.reduce((acc, c) => acc + statusProgress(c.status), 0);
  return { total, completed, percent: Math.round(sum / total) };
}

// ---------------------------------------------------------------------------
// Dependencies / blocking
//
// Rule: X is BLOCKED by Y when X is not done, Y is not done, and Y is at an
// earlier stage than X (Y is lagging behind X). X is merely WAITING on Y when
// Y is simply not done yet (soft, informational).
// ---------------------------------------------------------------------------

export interface BlockInfo {
  /** components blocking this one (lagging behind) */
  blockedBy: string[];
  /** unfinished dependencies that are not (yet) lagging */
  waitingOn: string[];
  /** unfinished components that depend on this one */
  blocking: string[];
}

type DepComponent = Pick<Component, 'id' | 'status' | 'dependsOn'>;

export function computeBlocking(components: DepComponent[]): Map<string, BlockInfo> {
  const byId = new Map(components.map((c) => [c.id, c]));
  const info = new Map<string, BlockInfo>();
  for (const c of components) info.set(c.id, { blockedBy: [], waitingOn: [], blocking: [] });

  for (const c of components) {
    if (isDone(c)) continue;
    const me = info.get(c.id)!;
    for (const depId of c.dependsOn) {
      const dep = byId.get(depId);
      if (!dep || isDone(dep)) continue;
      if (statusOrder(dep.status) < statusOrder(c.status)) {
        me.blockedBy.push(depId);
        info.get(depId)!.blocking.push(c.id);
      } else {
        me.waitingOn.push(depId);
      }
    }
  }
  return info;
}

export function isBlocked(c: DepComponent, blocking: Map<string, BlockInfo>): boolean {
  return (blocking.get(c.id)?.blockedBy.length ?? 0) > 0;
}

/** Returns true if adding edge (componentId depends on dependsOnId) would create a cycle. */
export function wouldCreateCycle(
  components: Pick<Component, 'id' | 'dependsOn'>[],
  componentId: string,
  dependsOnId: string,
): boolean {
  if (componentId === dependsOnId) return true;
  const byId = new Map(components.map((c) => [c.id, c]));
  // Walk from dependsOnId through its own dependencies; if we reach componentId, it's a cycle.
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === componentId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId.get(cur);
    if (node) stack.push(...node.dependsOn);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export function estimatedCost(c: Pick<Component, 'estMaterialCost' | 'estManufacturingCost' | 'estPurchaseCost' | 'estOtherCost'>): number {
  return (c.estMaterialCost ?? 0) + (c.estManufacturingCost ?? 0) + (c.estPurchaseCost ?? 0) + (c.estOtherCost ?? 0);
}

export interface CostSummary {
  estimated: number;
  actual: number;
  /** estimated cost of components that still have no actual cost */
  remainingEstimate: number;
}

export function computeCosts(components: Component[]): CostSummary {
  let estimated = 0;
  let actual = 0;
  let remainingEstimate = 0;
  for (const c of components) {
    const est = estimatedCost(c);
    estimated += est;
    if (c.actualCost != null) actual += c.actualCost;
    else remainingEstimate += est;
  }
  return { estimated, actual, remainingEstimate };
}

// ---------------------------------------------------------------------------
// Summary (dashboard / system cards / reports)
// ---------------------------------------------------------------------------

export interface ComponentsSummary extends ProgressSummary {
  overdue: number;
  dueSoon: number;
  blocked: number;
  /** components that are blocking at least one other */
  bottlenecks: number;
  inManufacturing: number;
  pendingManufacturing: number;
  pendingDesign: number;
  inspection: number;
  unassigned: number;
  critical: number;
  costs: CostSummary;
  workshopHours: number;
  pendingWorkshopHours: number;
}

export function summarizeComponents(components: Component[], blocking: Map<string, BlockInfo>, today: string = todayISO()): ComponentsSummary {
  const progress = computeProgress(components);
  let overdue = 0,
    dueSoon = 0,
    blocked = 0,
    bottlenecks = 0,
    inManufacturing = 0,
    pendingManufacturing = 0,
    pendingDesign = 0,
    inspection = 0,
    unassigned = 0,
    critical = 0;
  for (const c of components) {
    const done = isDone(c);
    if (isOverdue(c, today)) overdue++;
    if (isDueSoon(c, today)) dueSoon++;
    const b = blocking.get(c.id);
    if ((b?.blockedBy.length ?? 0) > 0) blocked++;
    if ((b?.blocking.length ?? 0) > 0) bottlenecks++;
    if (c.status === 'in_manufacturing') inManufacturing++;
    if (c.status === 'pending_manufacturing') pendingManufacturing++;
    if (c.status === 'idea' || c.status === 'design') pendingDesign++;
    if (c.status === 'inspection') inspection++;
    if (!done && !c.responsibleId) unassigned++;
    if (!done && c.priority === 'critical') critical++;
  }
  return {
    ...progress,
    overdue,
    dueSoon,
    blocked,
    bottlenecks,
    inManufacturing,
    pendingManufacturing,
    pendingDesign,
    inspection,
    unassigned,
    critical,
    costs: computeCosts(components),
    workshopHours: manufacturingHours(components),
    pendingWorkshopHours: manufacturingHours(components, true),
  };
}

// ---------------------------------------------------------------------------
// Manufacturing
// ---------------------------------------------------------------------------

export function manufacturingMinutes(m: Manufacturing | null | undefined): number {
  if (!m) return 0;
  return (m.setupMinutes ?? 0) + (m.machineMinutes ?? 0) + (m.finishingMinutes ?? 0) + (m.inspectionMinutes ?? 0);
}

export function manufacturingHours(components: Pick<Component, 'manufacturing' | 'quantity' | 'status'>[], onlyPending = false): number {
  let minutes = 0;
  for (const c of components) {
    if (onlyPending && isDone(c)) continue;
    minutes += manufacturingMinutes(c.manufacturing) * Math.max(1, c.quantity ?? 1);
  }
  return Math.round((minutes / 60) * 10) / 10;
}
