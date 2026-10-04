import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { AppEnv } from './auth.js';
import { notFound } from './errors.js';
import { requireProjectAccess, type ProjectAccess } from './permissions.js';

export type ProjectEnv = {
  Variables: AppEnv['Variables'] & {
    projectId: string;
    access: ProjectAccess;
  };
};

const uuid = z.uuid();

export function uuidParam(value: string | undefined, label = 'id'): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw notFound(`${label} inválido`);
  return parsed.data;
}

/** Loads the project access for `:projectId` and asserts view permission. */
export const withProject: MiddlewareHandler<ProjectEnv> = async (c, next) => {
  const projectId = uuidParam(c.req.param('projectId'), 'Proyecto');
  const access = await requireProjectAccess(c.var.user, projectId);
  c.set('projectId', projectId);
  c.set('access', access);
  await next();
};
