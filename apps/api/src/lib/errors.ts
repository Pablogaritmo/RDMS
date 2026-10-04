import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, details);
export const unauthorized = (msg = 'No autenticado') => new AppError(401, msg);
export const forbidden = (msg = 'No tienes permiso para realizar esta acción') => new AppError(403, msg);
export const notFound = (msg = 'No encontrado') => new AppError(404, msg);
export const conflict = (msg: string) => new AppError(409, msg);

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: err.message, details: err.details ?? null }, err.status as 400);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof ZodError) {
    return c.json({ error: 'Datos inválidos', details: err.issues }, 400);
  }
  // Postgres unique violation
  if ((err as { code?: string }).code === '23505') {
    return c.json({ error: 'Ya existe un registro con ese valor único' }, 409);
  }
  // Postgres FK violation (e.g. deleting a system with components)
  if ((err as { code?: string }).code === '23503') {
    return c.json({ error: 'La operación viola una referencia existente (hay registros que dependen de este elemento)' }, 409);
  }
  console.error(err);
  return c.json({ error: 'Error interno del servidor' }, 500);
}
