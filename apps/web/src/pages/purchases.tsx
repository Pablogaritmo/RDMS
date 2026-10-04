import { PurchaseDialog, PurchaseStatusBadge } from '@/components/domain/purchase-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, PageHeader, Stat, UserChip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/hooks/use-project';
import { formatDate, formatMoney } from '@/lib/format';
import { usePurchaseMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { PURCHASE_STATUSES, purchaseArrival, purchaseRisks, purchaseTotal, type Purchase, type PurchaseStatus } from '@rdms/shared';
import { AlertTriangle, ChevronDown, ExternalLink, Plus, ShoppingCart } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';

const NEXT: Partial<Record<PurchaseStatus, PurchaseStatus[]>> = {
  to_buy: ['ordered', 'cancelled'],
  ordered: ['in_transit', 'received', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: ['in_transit'],
  cancelled: ['to_buy'],
};

export function PurchasesPage() {
  const { project, purchases, componentsById, usersById, today, canManageProject, user } = useProject();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [editing, setEditing] = React.useState<Purchase | null | 'new'>(null);
  const mutation = usePurchaseMutation(project.id);

  const risks = React.useMemo(() => purchaseRisks(purchases, componentsById, today), [purchases, componentsById, today]);
  const riskByPurchase = new Map<string, (typeof risks)[number]>();
  for (const r of risks) if (!riskByPurchase.has(r.purchase.id)) riskByPurchase.set(r.purchase.id, r);

  const sum = (statuses: PurchaseStatus[]) => purchases.filter((p) => statuses.includes(p.status)).reduce((a, p) => a + purchaseTotal(p), 0);
  const filtered = purchases.filter((p) => !status || p.status === status).sort((a, b) => (riskByPurchase.has(b.id) ? 1 : 0) - (riskByPurchase.has(a.id) ? 1 : 0) || a.status.localeCompare(b.status) || b.createdAt.localeCompare(a.createdAt));

  const setStatus = (p: Purchase, next: PurchaseStatus) =>
    mutation.mutate({ id: p.id, input: { status: next } }, { onSuccess: () => toast.success(`${p.name} → ${PURCHASE_STATUSES.find((s) => s.key === next)?.label}`), onError: (e) => toast.error(e.message) });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Compras"
        description="Todo lo que hay que comprar para el cohete. Asocia cada compra a sus componentes para detectar entregas que llegan tarde."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Nueva compra
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Por comprar" value={formatMoney(sum(['to_buy']), project.currency, { compact: true })} hint={`${purchases.filter((p) => p.status === 'to_buy').length} compras`} tone="warning" onClick={() => setParams({ status: 'to_buy' })} />
        <Stat label="Comprometido" value={formatMoney(sum(['ordered', 'in_transit']), project.currency, { compact: true })} hint="pedido o en tránsito" tone="info" onClick={() => setParams({ status: 'ordered' })} />
        <Stat label="Recibido" value={formatMoney(sum(['received']), project.currency, { compact: true })} hint={`${purchases.filter((p) => p.status === 'received').length} compras`} tone="success" onClick={() => setParams({ status: 'received' })} />
        <Stat label="Total planificado" value={formatMoney(sum(['to_buy', 'ordered', 'in_transit', 'received']), project.currency, { compact: true })} hint="sin canceladas" />
        <Stat label="Compras críticas" value={riskByPurchase.size} tone={riskByPurchase.size ? 'danger' : 'default'} hint="llegan tarde o faltan" />
      </section>

      {risks.length ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="size-4" /> Compras críticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-xs">
              {risks.slice(0, 8).map((r, i) => (
                <li key={`${r.purchase.id}-${r.component.id}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <button type="button" className="font-medium hover:underline cursor-pointer" onClick={() => setEditing(r.purchase)}>
                    {r.purchase.name}
                  </button>
                  {r.reason === 'late' ? (
                    <span>
                      llega el <b>{formatDate(r.arrival)}</b> pero <Link to={`/p/${project.id}/components/${r.component.id}`} className="underline">{r.component.code}</Link> vence el <b>{formatDate(r.component.dueDate)}</b> ({r.daysLate} días tarde).
                    </span>
                  ) : (
                    <span>
                      aún no se ha pedido y <Link to={`/p/${project.id}/components/${r.component.id}`} className="underline">{r.component.code}</Link> ya está en etapa de fabricación.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setParams({})} className={cn('h-7 rounded-full border px-2.5 text-xs cursor-pointer hover:bg-accent', !status && 'border-primary bg-primary text-primary-foreground')}>
          Todas ({purchases.length})
        </button>
        {PURCHASE_STATUSES.map((s) => {
          const n = purchases.filter((p) => p.status === s.key).length;
          return (
            <button key={s.key} type="button" onClick={() => setParams({ status: s.key })} className={cn('h-7 rounded-full border px-2.5 text-xs cursor-pointer hover:bg-accent', status === s.key && 'border-primary bg-primary text-primary-foreground')}>
              {s.label} ({n})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ShoppingCart} title={purchases.length ? 'Sin compras en este estado' : 'Todavía no hay compras'} description="Registra materiales, piezas COTS y servicios externos. Cada compra puede asociarse a uno o varios componentes." action={<Button onClick={() => setEditing('new')}><Plus /> Nueva compra</Button>} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Compra</TableHead>
                <TableHead className="hidden md:table-cell">Componentes</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Llegada</TableHead>
                <TableHead className="hidden xl:table-cell">Solicitó</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const risk = riskByPurchase.get(p.id);
                const arrival = purchaseArrival(p, today);
                const editable = canManageProject || p.requestedById === user.id;
                return (
                  <TableRow key={p.id} className={cn('cursor-pointer', risk && 'bg-red-50/50')} onClick={() => setEditing(p)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {risk ? <AlertTriangle className="size-3.5 text-red-600" /> : null}
                        <span className="truncate">{p.name}</span>
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground" title="Abrir enlace">
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.supplier ?? 'Sin proveedor'} · {p.quantity} × {formatMoney(p.unitCost, project.currency)}
                        {p.shippingCost ? ` + envío ${formatMoney(p.shippingCost, project.currency)}` : ''}
                        {p.additionalCost ? ` + adic. ${formatMoney(p.additionalCost, project.currency)}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.componentIds.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                        {p.componentIds.map((id) => {
                          const c = componentsById.get(id);
                          return c ? (
                            <Link key={id} to={`/p/${project.id}/components/${id}`} onClick={(e) => e.stopPropagation()} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent" title={c.name}>
                              {c.code}
                            </Link>
                          ) : null;
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular text-sm font-medium">{formatMoney(purchaseTotal(p), project.currency)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {editable && NEXT[p.status]?.length ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex items-center gap-1 cursor-pointer">
                              <PurchaseStatusBadge status={p.status} />
                              <ChevronDown className="size-3 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {NEXT[p.status]!.map((n) => (
                              <DropdownMenuItem key={n} onSelect={() => setStatus(p, n)}>
                                {PURCHASE_STATUSES.find((s) => s.key === n)?.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <PurchaseStatusBadge status={p.status} />
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {p.status === 'received' ? (
                        <span className="text-muted-foreground">recibido {formatDate(p.receivedAt)}</span>
                      ) : p.status === 'cancelled' ? (
                        '—'
                      ) : arrival ? (
                        <span className={cn(risk?.reason === 'late' && 'text-red-600 font-medium')}>
                          {formatDate(arrival)}
                          {p.leadTimeDays != null && !p.expectedAt ? <span className="text-muted-foreground"> (~{p.leadTimeDays} d)</span> : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">sin estimar</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <UserChip user={p.requestedById ? usersById.get(p.requestedById) : null} size="xs" className="text-xs" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PurchaseDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} purchase={editing === 'new' ? null : editing} />
    </div>
  );
}
