# RDMS — Rocket Development Management System

Herramienta web para gestionar el desarrollo de cohetes experimentales del equipo **CRATER** (Costa Rican Aerospace Team for Experimental Rocketry), GIA · UCR.

> La documentación debe generarse como consecuencia natural del trabajo del equipo, no convertirse en trabajo adicional.

Un proyecto (p. ej. *IREC 2027*) se divide en **sistemas** (Aeroestructuras, Propulsión, Recuperación, Aviónica, Payload, Simulación…) y cada sistema en **componentes**. El componente es la entidad central: estado, responsable, prioridad, fechas, material, costos, manufactura y dependencias. Todo lo demás —avance, atrasos, bloqueos, presupuesto, horas de taller, alertas, historial— se **deriva automáticamente**.

---

## 1. Arquitectura

```
┌─────────────────────────┐        ┌──────────────────────────┐        ┌──────────────┐
│  apps/web  (SPA)        │  /api  │  apps/api  (Hono, Node)  │  SQL   │  PostgreSQL  │
│  React 19 + Vite        │ ─────▶ │  Drizzle ORM + zod       │ ─────▶ │  16          │
│  TanStack Query         │ cookie │  sesiones · permisos     │        │              │
└─────────────────────────┘        │  activity log            │        └──────────────┘
             ▲                     └──────────────────────────┘
             │  tipos, schemas zod, reglas derivadas (isBlocked, isOverdue, progreso, costos)
             └──────────────── packages/shared ───────────────────────────────┘
```

- **Monorepo pnpm** con tres paquetes: `apps/web`, `apps/api`, `packages/shared`.
- El frontend carga **un solo "bundle" por proyecto** (`GET /api/projects/:id/bundle`: proyecto, miembros, sistemas, componentes, hitos) y calcula en el cliente filtros, KPIs, bloqueos y alertas con las funciones puras de `packages/shared`. Resultado: filtros instantáneos y una única fuente de verdad para las reglas (el API usa las mismas funciones).
- Toda mutación pasa por el API, que valida con zod, aplica permisos, registra el **historial automáticamente** (diff de campos) y devuelve el recurso actualizado. El cliente invalida el bundle y la UI se actualiza.
- En producción **el API sirve el SPA compilado** → un solo proceso/contenedor + Postgres.

### ¿Por qué no Supabase como BaaS?
El modelo de permisos (admin global → líder de proyecto → líder de sistema → responsable/colaborador) y la lógica de negocio (transiciones de estado, bloqueo derivado, historial con diffs, acumulados) viven mejor en TypeScript que en políticas RLS y triggers plpgsql: es legible, testeable y mantenible por estudiantes. La base de datos sí puede hospedarse en Supabase/Neon (Postgres gestionado) sin cambiar una línea.

## 2. Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Radix UI (`radix-ui`), cmdk, TanStack Query 5, React Router 7, lucide-react, date-fns, sonner |
| Backend | Node 22, Hono 4, Drizzle ORM 0.45 (+ drizzle-kit para migraciones SQL), zod 4, `pg` |
| Auth | Sesiones en DB con cookie `httpOnly` + `SameSite=Lax` (+ `Secure` en prod); contraseñas con `scrypt` (node:crypto); throttle de login; verificación de `Origin` en mutaciones |
| DB | PostgreSQL 16 (Docker Compose en dev) |
| Build / deploy | esbuild (API), Vite (web), Dockerfile multi-stage, `docker compose` |

## 3. Base de datos

Diseñada completa desde el inicio (incluye tablas de fases 2–3 aún sin UI). Migración inicial: `apps/api/drizzle/0000_init.sql`. Esquema fuente: `apps/api/src/db/schema.ts`.

```
users              id, email*, name, password_hash, avatar_url, role(admin|member), is_active
sessions           id (sha256 del token), user_id → users, expires_at
projects           id, name, description, competition, status, start_date, target_date, budget, currency
project_members    (project_id, user_id) PK, role(lead|member)
systems            id, project_id → projects, code (REC), name, description, budget, sort_order     UNIQUE(project_id, code)
system_members     (system_id, user_id) PK, role(lead|member)
components         id, project_id, system_id → systems (RESTRICT), code (REC-001) UNIQUE(project_id, code), name,
                   description, subsystem, quantity, responsible_id → users, priority, status, start_date, due_date,
                   completed_at, material, material_qty, material_unit, supplier, material_status, designer_id,
                   design_approved_at, design_notes, est_material_cost, est_manufacturing_cost, est_purchase_cost,
                   est_other_cost, actual_cost, created_by
component_members  (component_id, user_id) PK                               ← colaboradores
dependencies       (component_id, depends_on_id) PK, CHECK no auto-dependencia  ← ciclos rechazados en el API
manufacturing      component_id PK (1:1), process, machine, workshop, setup/machine/finishing/inspection_minutes,
                   responsible_id, scheduled_date, actual_date, needs_workshop, needs_external, notes
milestones         id, project_id, name, date, description, completed_at
activity_logs      id, project_id, entity_type, entity_id, entity_label, user_id, action, changes (jsonb), note, created_at
--- fase 2/3 (esquema listo, UI pendiente) ---
purchases, purchase_components, inspections, tests, files
```

Decisiones:
- **No hay tabla `budgets`**: el presupuesto vive en `projects.budget` y `systems.budget`; gastado/estimado/disponible se derivan de los componentes (y de compras en fase 2).
- **Nunca se almacenan** % de avance, atrasado, bloqueado, "bloquea N", totales de costo ni horas de taller. Se calculan en `packages/shared/src/derived.ts`.
- El **líder** de proyecto/sistema es la membresía con `role = 'lead'` (permite co-líderes, sin columnas duplicadas).
- Los estados/prioridades son `text` validados por zod (no enums de Postgres) para que agregar uno sea un cambio en `packages/shared/src/constants.ts` sin migración.
- Usuarios desactivados no pueden iniciar sesión ni ser asignados, pero conservan todo su historial (FK `ON DELETE SET NULL`, nombres guardados en `entity_label`/`toLabel`).

### Reglas de negocio clave
- **Estados**: Idea → Diseño → Diseño aprobado → Pendiente de fabricación → En fabricación → Inspección → Completado → Integrado. Retroceder siempre está permitido (rework, con nota opcional); avanzar solo por transiciones lógicas (p. ej. una pieza comprada puede ir de *Diseño aprobado* a *Completado*, pero *Diseño → Integrado* se rechaza).
- **Bloqueado** es un estado *derivado*: un componente está bloqueado cuando no está terminado y depende de otro que va en una **etapa anterior** a la suya. Si la dependencia simplemente no está terminada se muestra como "esperando". Al avanzar la dependencia, el API informa qué componentes "pueden continuar".
- **Atrasado**: fecha límite pasada y no completado. **Vence pronto**: en los próximos 7 días.
- **Avance %**: ponderado por etapa (Idea 0 … Completado/Integrado 100), siempre junto a "n/N completados".
- **Permisos**: admin (global) → todo; líder de proyecto → todo dentro del proyecto; líder de sistema → su sistema; miembro → ve todo el proyecto, crea componentes en los sistemas a los que pertenece (queda como responsable) y edita los componentes donde es responsable o colaborador. Reasignar responsable, cambiar sistema/código y eliminar requieren ser líder.

## 4. Estructura del proyecto

```
RDMS/
├── apps/
│   ├── api/                      API (Hono)
│   │   ├── drizzle/              migraciones SQL generadas
│   │   ├── src/
│   │   │   ├── db/               schema.ts, index.ts (pool), migrate.ts, seed.ts, cli-*.ts, reset.ts
│   │   │   ├── lib/              auth.ts (sesiones), password.ts, permissions.ts, activity.ts, errors.ts, serialize.ts
│   │   │   ├── routes/           auth.ts, users.ts, projects.ts (+ members, systems, milestones, activity, search), components.ts
│   │   │   ├── services/         components.ts (crear/editar/estado/deps/colaboradores/manufactura), projects.ts (bundle)
│   │   │   ├── app.ts            composición de la app, middlewares
│   │   │   └── index.ts          arranque: migraciones → admin inicial → servidor (+ SPA en prod)
│   │   └── build.mjs             bundle con esbuild → dist/index.js
│   └── web/                      SPA (React)
│       └── src/
│           ├── components/ui/    primitivos (button, input, dialog, dropdown, popover, command, table, …)
│           ├── components/domain/ badges, status-changer, component-table, component-form, pickers, activity-feed, manufacturing-form
│           ├── components/layout/ app-shell (sidebar, selector de proyecto, búsqueda Ctrl+K), global-search
│           ├── hooks/use-project.tsx  contexto del proyecto: bundle + mapas + bloqueos + permisos UI
│           ├── lib/              api.ts, queries.ts (TanStack Query), format.ts, alerts.ts, utils.ts
│           ├── pages/            login, projects, dashboard, components, component-detail, systems, system-detail,
│           │                     schedule, activity, project-settings, users
│           └── App.tsx           rutas y guardas
├── packages/shared/src/          constants.ts (estados, transiciones, prioridades…), schemas.ts (zod), types.ts (DTOs), derived.ts
├── docker-compose.yml            db (dev) + app (perfil "app")
├── Dockerfile                    imagen de producción (API + SPA)
└── .env.example
```

Rutas del SPA: `/login`, `/projects`, `/users` (admin), `/p/:projectId` (dashboard), `/p/:projectId/components[/:id]`, `/systems[/:id]`, `/schedule`, `/activity`, `/settings`. Los filtros de componentes viven en la URL (`?system=…&responsible=…&status=…&priority=…&flag=overdue|blocked|due_soon|open|done&material=…&before=YYYY-MM-DD&q=…`) → enlaces compartibles.

## 5. Ejecutar localmente

Requisitos: Node ≥ 22, pnpm 10 (`corepack enable`), Docker (para Postgres).

```bash
cp .env.example .env          # ajusta ADMIN_* si quieres
pnpm install
pnpm db:up                    # Postgres 16 en localhost:5432 (docker compose)
pnpm db:seed                  # migraciones + admin + proyecto demo "IREC 2027"
pnpm dev                      # API en :3000 y web en :5173 (con proxy /api)
```

Abre http://localhost:5173.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `pnpm dev:api` / `pnpm dev:web` | Levantar solo una parte |
| `pnpm typecheck` | `tsc --noEmit` en los 3 paquetes |
| `pnpm build` | Compila API (`apps/api/dist`) y web (`apps/web/dist`) |
| `pnpm db:generate` | Genera una migración a partir de cambios en `schema.ts` |
| `pnpm db:migrate` | Aplica migraciones pendientes (también ocurre al arrancar el API) |
| `pnpm db:reset -- --yes` | **Borra** la DB local y vuelve a sembrar |
| `pnpm --filter @rdms/api db:studio` | Drizzle Studio (explorador de la DB) |

## 6. Desplegar

### Opción A — Docker Compose (VPS del club, servidor de la universidad)
```bash
cp .env.example .env   # define ADMIN_EMAIL/ADMIN_PASSWORD y SEED_DEMO=false
docker compose --profile app up -d --build
```
Expone la app en el puerto 3000 (API + SPA) con Postgres en un volumen. Pon un proxy HTTPS delante (Caddy/nginx/Traefik). Si vas a usarla **solo por HTTP en una LAN**, añade `INSECURE_COOKIES=true` para que la cookie de sesión funcione sin TLS.

### Opción B — PaaS (Fly.io, Railway, Render) + Postgres gestionado (Supabase / Neon)
1. Crea una base Postgres y copia su `DATABASE_URL`.
2. Despliega el repositorio con el `Dockerfile` incluido (los tres servicios lo detectan automáticamente).
3. Variables: `DATABASE_URL`, `NODE_ENV=production`, `PORT` (el que pida la plataforma), `TRUST_PROXY=true`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_DEMO=false`.
4. Al arrancar, el API aplica migraciones y crea el administrador si la tabla de usuarios está vacía.

El coste es ~0: una instancia pequeña + el plan gratuito de Postgres alcanza de sobra para 10–50 usuarios.

## 7. Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgres://rdms:rdms@localhost:5432/rdms` | Conexión Postgres |
| `PORT` | `3000` | Puerto del API (y del SPA en prod) |
| `NODE_ENV` | `development` | `production` activa cookies `Secure`, sirve `apps/web/dist` y desactiva CORS |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen del frontend en desarrollo |
| `TRUST_PROXY` | `false` | Detrás de un proxy HTTPS (para `X-Forwarded-*`) |
| `INSECURE_COOKIES` | `false` | Permite cookies sin `Secure` en producción (solo LAN sin TLS) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `admin@crater.ucr.ac.cr` / `admin1234` / `Administrador` | Admin creado cuando la DB está vacía |
| `SEED_DEMO` | `true` | Carga el proyecto demo al crear el admin / ejecutar `db:seed` |

## 8. Credenciales demo

Con `SEED_DEMO=true` se crea el proyecto **IREC 2027** (6 sistemas, 32 componentes con dependencias, costos, manufactura e historial) y estos usuarios (contraseña `demo1234`):

| Usuario | Rol en el proyecto |
|---|---|
| `admin@crater.ucr.ac.cr` (`admin1234`) | Administrador global |
| `maria@crater.ucr.ac.cr` | Líder de proyecto |
| `pablo@crater.ucr.ac.cr` | Líder de Recuperación |
| `ana@crater.ucr.ac.cr` | Líder de Aeroestructuras |
| `carlos@crater.ucr.ac.cr` | Líder de Propulsión |
| `jose@crater.ucr.ac.cr` | Líder de Aviónica |
| `lucia@crater.ucr.ac.cr` | Líder de Payload, miembro de Recuperación |
| `diego@crater.ucr.ac.cr`, `sofia@crater.ucr.ac.cr` | Miembros |
| `andres@crater.ucr.ac.cr` | **Inactivo** (graduado) — conserva su historial |

Cambia la contraseña del admin tras el primer inicio de sesión (menú de usuario → *Cambiar contraseña*).

## 9. Cómo extender el sistema

**Agregar un estado o prioridad** → edita `packages/shared/src/constants.ts` (`COMPONENT_STATUSES`, `FORWARD_TRANSITIONS`, pesos de avance) y los colores en `apps/web/src/components/domain/badges.tsx`. No hace falta migración.

**Agregar un campo a componentes**
1. `apps/api/src/db/schema.ts` → columna; `pnpm db:generate` crea la migración.
2. `packages/shared/src/schemas.ts` (zod) y `types.ts` (DTO); `COMPONENT_FIELD_LABELS` para que el historial lo nombre en español.
3. `apps/api/src/lib/serialize.ts` y `services/components.ts` (`UPDATABLE_FIELDS`).
4. UI: `component-form.tsx` y `component-detail.tsx`.

**Agregar un módulo (p. ej. Compras, fase 2)** — las tablas ya existen:
1. `routes/purchases.ts` montado en `projectScopedRoutes` (hereda `withProject` → permisos del proyecto).
2. Loader en `services/` y, si debe estar en el bundle, añádelo a `loadProjectBundle` + `ProjectBundle`.
3. Hooks en `apps/web/src/lib/queries.ts`, página en `pages/`, ruta en `App.tsx`, entrada en el menú (`app-shell.tsx`).
4. Registra cambios con `logActivity(...)` para que aparezcan en el historial sin trabajo extra.

**Reportes (fase 3)**: usa `summarizeComponents`, `computeBlocking`, `computeCosts`, `manufacturingHours` de `packages/shared` en un endpoint `/api/projects/:id/reports/:type`; los datos ya existen, no se piden formularios adicionales.

**Archivos (fase 3)**: la tabla `files` guarda `storage_key`/`url`; implementa un `StorageAdapter` (disco local en dev, S3/Supabase Storage/R2 en prod) y un endpoint de subida por entidad.

**Hoja de ruta** · Fase 2: manufactura (vista taller y horas por máquina), compras con alertas de plazo, presupuesto estimado vs. real, Gantt con dependencias. · Fase 3: archivos, inspecciones (rechazo → regresa a fabricación), pruebas, reportes (Status, Manufacturing, Procurement, Design Review). · Fase 4: notificaciones selectivas, métricas históricas entre proyectos, estados configurables por proyecto.

## Verificación

```bash
pnpm typecheck && pnpm build
```
Flujos cubiertos manualmente (navegador y API): login/logout, permisos por rol (403 en edición ajena, creación restringida por sistema, admin-only), transiciones válidas/inválidas, bloqueo derivado y aviso de desbloqueo, ciclos de dependencias rechazados, filtros por URL, búsqueda global, historial automático, CRUD de usuarios/sistemas/hitos, cookies `HttpOnly/Secure/SameSite` y rechazo de `Origin` ajeno en producción.
