import { componentRealCost, daysBetween, estimatedCost, isDoneStatus, statusOrder, type ActivityChange, type ComponentStatus, type ProjectMetrics } from '@rdms/shared';
import { and, asc, eq, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { loadComponents } from './components.js';
import { loadInspections } from './inspections.js';
import { loadPurchases } from './purchases.js';
import { loadTests } from './tests.js';

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const day = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

/** Historical metrics derived from the activity log + current data. Nothing is stored. */
export async function computeMetrics(projectId: string): Promise<ProjectMetrics> {
  const [components, purchases, tests, inspections, statusLogs] = await Promise.all([
    loadComponents(projectId),
    loadPurchases(projectId),
    loadTests(projectId),
    loadInspections(projectId),
    db
      .select({ entityId: schema.activityLogs.entityId, changes: schema.activityLogs.changes, createdAt: schema.activityLogs.createdAt, userId: schema.activityLogs.userId, action: schema.activityLogs.action })
      .from(schema.activityLogs)
      .where(and(eq(schema.activityLogs.projectId, projectId), eq(schema.activityLogs.entityType, 'component')))
      .orderBy(asc(schema.activityLogs.createdAt)),
  ]);
  const byId = new Map(components.map((c) => [c.id, c]));

  // --- rework: backwards status moves
  const reworkCount = new Map<string, number>();
  const firstManufacturing = new Map<string, string>();
  const completedAt = new Map<string, string>();
  for (const log of statusLogs) {
    if (log.action !== 'status_changed') continue;
    const ch = (log.changes as ActivityChange[] | null)?.find((c) => c.field === 'status');
    if (!ch) continue;
    const from = ch.from as ComponentStatus | null;
    const to = ch.to as ComponentStatus;
    if (from && statusOrder(to) < statusOrder(from)) reworkCount.set(log.entityId, (reworkCount.get(log.entityId) ?? 0) + 1);
    if ((to === 'in_manufacturing' || to === 'pending_manufacturing') && !firstManufacturing.has(log.entityId)) firstManufacturing.set(log.entityId, day(log.createdAt));
    if (isDoneStatus(to)) completedAt.set(log.entityId, day(log.createdAt));
  }
  const reworkedComponents = [...reworkCount.entries()]
    .map(([id, count]) => ({ c: byId.get(id), count }))
    .filter((x): x is { c: NonNullable<typeof x.c>; count: number } => !!x.c)
    .map(({ c, count }) => ({ id: c.id, code: c.code, name: c.name, count }))
    .sort((a, b) => b.count - a.count);

  // --- manufacturing durations (entered manufacturing → completed)
  const manufacturingDurations = components
    .filter((c) => isDoneStatus(c.status) && firstManufacturing.has(c.id))
    .map((c) => ({ id: c.id, code: c.code, name: c.name, days: daysBetween(firstManufacturing.get(c.id)!, completedAt.get(c.id) ?? day(c.completedAt ?? new Date())) }))
    .filter((x) => x.days >= 0);

  // --- acquisition times
  const acquisitionTimes = purchases
    .filter((p) => p.orderedAt && p.receivedAt)
    .map((p) => ({ id: p.id, name: p.name, days: daysBetween(p.orderedAt!, p.receivedAt!) }))
    .filter((x) => x.days >= 0);

  // --- schedule variance (completed vs due)
  const scheduleVariance = components
    .filter((c) => isDoneStatus(c.status) && c.dueDate && c.completedAt)
    .map((c) => ({ id: c.id, code: c.code, name: c.name, days: daysBetween(c.dueDate!, day(c.completedAt!)) }));
  const onTime = scheduleVariance.filter((x) => x.days <= 0).length;

  // --- cost variance
  const costVariance = components
    .map((c) => ({ c, actual: componentRealCost(c, purchases), estimated: estimatedCost(c) }))
    .filter((x): x is { c: (typeof components)[number]; actual: number; estimated: number } => x.actual != null && x.estimated > 0)
    .map(({ c, actual, estimated }) => ({ id: c.id, code: c.code, name: c.name, estimated, actual }));

  const since = new Date(Date.now() - 30 * 86_400_000);
  const recent = await db
    .select({ userId: schema.activityLogs.userId, action: schema.activityLogs.action })
    .from(schema.activityLogs)
    .where(and(eq(schema.activityLogs.projectId, projectId), gte(schema.activityLogs.createdAt, since)));

  return {
    reworkedComponents,
    manufacturingDurations,
    avgManufacturingDays: avg(manufacturingDurations.map((x) => x.days)),
    acquisitionTimes,
    avgAcquisitionDays: avg(acquisitionTimes.map((x) => x.days)),
    scheduleVariance,
    avgScheduleVarianceDays: avg(scheduleVariance.map((x) => x.days)),
    onTimeRate: scheduleVariance.length ? Math.round((onTime / scheduleVariance.length) * 100) : null,
    costVariance,
    totalEstimatedKnown: costVariance.reduce((a, x) => a + x.estimated, 0),
    totalActualKnown: costVariance.reduce((a, x) => a + x.actual, 0),
    testsFailed: tests.filter((t) => t.status === 'failed').length,
    testsPassed: tests.filter((t) => t.status === 'passed').length,
    inspectionsRejected: inspections.filter((i) => i.result === 'rejected').length,
    inspectionsTotal: inspections.length,
    statusChangesLast30Days: recent.filter((r) => r.action === 'status_changed').length,
    activeContributorsLast30Days: new Set(recent.map((r) => r.userId).filter(Boolean)).size,
  };
}
