import { daysBetween, todayISO } from '@rdms/shared';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number | null | undefined, currency = 'CRC', opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const key = `${currency}:${opts.compact ? 'c' : 'f'}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency,
        notation: opts.compact ? 'compact' : 'standard',
        ...(opts.compact ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 0 }),
      });
    } catch {
      fmt = new Intl.NumberFormat('es-CR', { notation: opts.compact ? 'compact' : 'standard', ...(opts.compact ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 0 }) });
    }
    moneyFormatters.set(key, fmt);
  }
  return fmt.format(value);
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { maximumFractionDigits: digits }).format(value);
}

/** `2026-10-04` → `4 oct 2026` */
export function formatDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), pattern, { locale: es });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { locale: es, addSuffix: true });
  } catch {
    return iso;
  }
}

/** Human description of a due date relative to today: "vence en 3 días", "atrasado 5 días". */
export function dueLabel(due: string | null | undefined, today: string = todayISO()): string {
  if (!due) return '';
  const d = daysBetween(today, due);
  if (d === 0) return 'vence hoy';
  if (d === 1) return 'vence mañana';
  if (d > 1) return `vence en ${d} días`;
  if (d === -1) return 'atrasado 1 día';
  return `atrasado ${-d} días`;
}

export function formatHours(hours: number): string {
  if (hours === 0) return '0 h';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${formatNumber(hours, 1)} h`;
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}
