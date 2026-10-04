import type { ProjectData } from '@/hooks/use-project';
import { formatMoney } from '@/lib/format';
import { computeCosts, daysBetween, estimatedCost, isDone, purchaseRisks, purchasesForComponents, type Component } from '@rdms/shared';

export interface Alert {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  text: string;
  href?: string;
}

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

/** Derives the dashboard alerts from project data. Nothing here is stored. */
export function buildAlerts(data: ProjectData): Alert[] {
  const { project, components, systems, milestones, blocking, today, isOverdue, isDueSoon, purchases, componentsById } = data;
  const base = `/p/${project.id}/components`;
  const alerts: Alert[] = [];
  const open = components.filter((c) => !isDone(c));

  const overdue = open.filter(isOverdue);
  if (overdue.length) {
    alerts.push({
      id: 'overdue',
      severity: 'danger',
      text: `${overdue.length} ${plural(overdue.length, 'componente está atrasado', 'componentes están atrasados')}.`,
      href: `${base}?flag=overdue`,
    });
  }

  // bottlenecks: components blocking the most others
  const bottlenecks = open
    .map((c) => ({ c, n: blocking.get(c.id)?.blocking.length ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  for (const { c, n } of bottlenecks) {
    alerts.push({
      id: `bottleneck-${c.id}`,
      severity: n >= 3 ? 'danger' : 'warning',
      text: `${c.name} (${c.code}) está bloqueando ${n} ${plural(n, 'componente', 'componentes')}.`,
      href: `${base}/${c.id}`,
    });
  }

  // material not bought for parts that should be in the workshop soon
  const materialMissing = open.filter((c) => c.materialStatus === 'to_buy' && ['design_approved', 'pending_manufacturing', 'in_manufacturing'].includes(c.status));
  for (const c of materialMissing.slice(0, 3)) {
    alerts.push({
      id: `material-${c.id}`,
      severity: c.status === 'in_manufacturing' || c.status === 'pending_manufacturing' ? 'danger' : 'warning',
      text: `El material de ${c.name} (${c.code}) todavía no ha sido comprado.`,
      href: `${base}/${c.id}`,
    });
  }
  if (materialMissing.length > 3) {
    alerts.push({ id: 'material-more', severity: 'warning', text: `Otros ${materialMissing.length - 3} componentes listos para fabricar aún no tienen material.`, href: `${base}?material=to_buy` });
  }

  // purchases arriving late / not ordered
  const risks = purchaseRisks(purchases, componentsById, today);
  const seen = new Set<string>();
  for (const r of risks) {
    if (seen.has(r.purchase.id)) continue;
    seen.add(r.purchase.id);
    if (seen.size > 3) break;
    alerts.push({
      id: `purchase-${r.purchase.id}`,
      severity: 'danger',
      text:
        r.reason === 'late'
          ? `${r.purchase.name} llega el ${r.arrival} y ${r.component.code} vence el ${r.component.dueDate} (${r.daysLate} días tarde).`
          : `${r.purchase.name} todavía no se ha pedido y ${r.component.code} ya está en fabricación.`,
      href: `/p/${project.id}/purchases`,
    });
  }

  // due soon
  const soon = open.filter(isDueSoon);
  if (soon.length) {
    alerts.push({
      id: 'due-soon',
      severity: 'warning',
      text: `${soon.length} ${plural(soon.length, 'componente vence', 'componentes vencen')} en los próximos 7 días.`,
      href: `${base}?flag=due_soon`,
    });
  }

  // budget
  const costs = computeCosts(components, purchases);
  if (project.budget && costs.estimated > project.budget) {
    const pct = Math.round(((costs.estimated - project.budget) / project.budget) * 100);
    alerts.push({ id: 'budget-project', severity: 'danger', text: `El costo estimado del cohete supera el presupuesto en ${pct}% (${formatMoney(costs.estimated - project.budget, project.currency)}).`, href: `/p/${project.id}/budget` });
  }
  if (project.budget && costs.actual + costs.committed > project.budget) {
    alerts.push({ id: 'budget-spent', severity: 'danger', text: `Gastado + comprometido (${formatMoney(costs.actual + costs.committed, project.currency)}) supera el presupuesto.`, href: `/p/${project.id}/budget` });
  }
  for (const s of systems) {
    if (!s.budget) continue;
    const comps = components.filter((c) => c.systemId === s.id);
    const est = comps.reduce((acc, c) => acc + estimatedCost(c), 0);
    if (est > s.budget) {
      const pct = Math.round(((est - s.budget) / s.budget) * 100);
      alerts.push({ id: `budget-${s.id}`, severity: 'warning', text: `El presupuesto de ${s.name} está excedido en ${pct}% (estimado).`, href: `/p/${project.id}/budget` });
    }
    const spent = computeCosts(comps, purchasesForComponents(new Set(comps.map((c) => c.id)), purchases), false).actual;
    if (spent > s.budget) {
      alerts.push({ id: `budget-spent-${s.id}`, severity: 'danger', text: `${s.name} ya gastó más que su presupuesto (${formatMoney(spent, project.currency)}).`, href: `/p/${project.id}/budget` });
    }
  }

  // pieces waiting for inspection
  const awaiting = open.filter((c) => c.status === 'inspection');
  if (awaiting.length) {
    alerts.push({ id: 'inspection', severity: 'info', text: `${awaiting.length} ${plural(awaiting.length, 'componente espera', 'componentes esperan')} inspección.`, href: `${base}?status=inspection` });
  }

  // next milestone
  const next = milestones.filter((m) => !m.completedAt && m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const days = daysBetween(today, next.date);
    const pending = open.filter((c) => c.dueDate && c.dueDate <= next.date);
    if (pending.length && days <= 45) {
      alerts.push({
        id: `milestone-${next.id}`,
        severity: days <= 14 ? 'warning' : 'info',
        text: `${next.name} es en ${days} ${plural(days, 'día', 'días')}: ${pending.length} ${plural(pending.length, 'componente con fecha límite anterior no está completo', 'componentes con fecha límite anterior no están completos')}.`,
        href: `${base}?before=${next.date}`,
      });
    }
  }

  // unassigned
  const unassigned = open.filter((c) => !c.responsibleId);
  if (unassigned.length) {
    alerts.push({ id: 'unassigned', severity: 'info', text: `${unassigned.length} ${plural(unassigned.length, 'componente no tiene', 'componentes no tienen')} responsable.`, href: `${base}?responsible=none` });
  }

  const order = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Sort helper for "Mi trabajo": overdue → due soon → critical → due date. */
export function workOrder(data: ProjectData) {
  const prio = { critical: 0, high: 1, medium: 2, low: 3 };
  return (a: Component, b: Component) => {
    const ao = data.isOverdue(a) ? 0 : data.isDueSoon(a) ? 1 : 2;
    const bo = data.isOverdue(b) ? 0 : data.isDueSoon(b) ? 1 : 2;
    if (ao !== bo) return ao - bo;
    if (prio[a.priority] !== prio[b.priority]) return prio[a.priority] - prio[b.priority];
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  };
}
