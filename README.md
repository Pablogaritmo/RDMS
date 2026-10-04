# RDMS — Rocket Development Management System

Herramienta web para gestionar el desarrollo de cohetes experimentales del equipo **CRATER** (Costa Rican Aerospace Team for Experimental Rocketry), GIA · UCR.

> La documentación debe generarse como consecuencia natural del trabajo del equipo, no convertirse en trabajo adicional.

Un proyecto (p. ej. *IREC 2027*) se divide en **sistemas** (Aeroestructuras, Propulsión, Recuperación, Aviónica, Payload, Simulación…) y cada sistema en **componentes**. El componente es la entidad central: estado, responsable, prioridad, fechas, material, costos, manufactura, dependencias, planos/archivos, compras, inspecciones y pruebas. Todo lo demás —avance, atrasos, bloqueos, presupuesto, horas de taller, compras críticas, alertas, reportes, métricas, historial— se **deriva automáticamente**.

## Módulos

| Módulo | Qué hace |
|---|---|
| Dashboard | KPIs, "Mi trabajo" con avisos personales, alertas, comparativa de sistemas, actividad reciente |
| Componentes | Tabla con filtros en URL (sistema, responsable, estado, prioridad, material, fecha, atrasados, bloqueados, **cuellos de botella**, taller), ordenable por *cuántos componentes bloquea* |
| Detalle de componente | Estado en un clic, resumen, material y costos (material · manufactura · envío · adicionales), manufactura, **archivos y planos**, compras asociadas, pruebas, dependencias, inspecciones, diseño, historial |
| Sistemas | Comparativa (avance, atrasados, bloqueados, horas, estimado vs presupuesto, gastado) y detalle con equipo |
| Cronograma | Hitos (PDR, CDR, TRR… configurables) con "qué debe estar listo antes" y Gantt con **flechas de dependencias** |
| Manufactura | **Vista de taller por máquina/proceso**, horas por sistema, cola de taller, piezas sin tiempos |
| Compras | Procurement con estados, totales (por comprar · comprometido · recibido) y **compras críticas** (la entrega llega después de la fecha límite del componente) |
| Pruebas | Pruebas por componente/sistema con objetivo, resultado, estado y evidencia adjunta |
| Presupuesto | Estimado vs comprometido vs gastado, por sistema y por categoría; estimado vs real por componente |
| Reportes | Status, Manufacturing, Procurement y Design Review (título configurable: SRR/PDR/CDR/TRR) imprimibles a PDF |
| Métricas | Entregas a tiempo, desvío de fechas, tiempos de fabricación y adquisición, costo real vs estimado, reprocesos, pruebas fallidas, inspecciones rechazadas |
| Actividad | Historial automático de todo el proyecto |
| Configuración / Usuarios | Proyecto, equipo, sistemas, hitos; administración de usuarios |

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
                   design_approved_at, design_notes, est_material_cost, est_manufacturing_cost, est_shipping_cost,
                   est_additional_cost, actual_cost, created_by
component_members  (component_id, user_id) PK                               ← colaboradores
dependencies       (component_id, depends_on_id) PK, CHECK no auto-dependencia  ← ciclos rechazados en el API
manufacturing      component_id PK (1:1), process, machine, workshop, setup/machine/finishing/inspection_minutes,
                   responsible_id, scheduled_date, actual_date, needs_workshop, needs_external, notes
milestones         id, project_id, name, date, description, completed_at
activity_logs      id, project_id, entity_type, entity_id, entity_label, user_id, action, changes (jsonb), note, created_at
purchases          id, project_id, name, description, quantity, unit_cost, shipping_cost, additional_cost, supplier, url,
                   status(to_buy|ordered|in_transit|received|cancelled), lead_time_days, ordered_at, expected_at, received_at,
                   requested_by, notes
purchase_components (purchase_id, component_id) PK                       ← una compra puede servir a varios componentes
inspections        id, component_id, inspector_id, date, result(approved|approved_with_notes|rejected), observations
tests              id, project_id, system_id?, component_id?, name, type, date, responsible_id, objective, result,
                   status(planned|ready|executed|passed|failed), observations
files              id, project_id, entity_type(component|test|inspection|project), entity_id, category(drawing|cad|
                   datasheet|photo|manufacturing|test_result|other), name, storage_key, mime, size, uploaded_by
```

Migraciones: `0000_init.sql` (modelo base) y `0001_costs_files_purchases.sql` (categorías de costo, categoría de archivo, campos de compra).

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
- **Costos**: cada componente estima **material, manufactura, envío y adicionales** (impuestos, aduana, consumibles). *Comprometido* = compras pedidas o en tránsito; *Gastado* = costo real tecleado (o, si no existe, la suma de sus compras recibidas) + compras recibidas sin componente. Así no se cuenta dos veces.
- **Compras críticas**: la llegada estimada (fecha esperada o pedido + tiempo de entrega) cae después de la fecha límite de un componente asociado, o la compra sigue "por comprar" cuando la pieza ya está en fabricación.
- **Inspecciones**: cualquier miembro del proyecto puede inspeccionar. *Rechazado* devuelve la pieza a *En fabricación* (o *Diseño* si nunca se fabricó); *Aprobado* la pasa a *Completado* si estaba en *Inspección*. Todo queda en el historial.
- **Archivos**: se guardan en disco (`UPLOAD_DIR`, volumen Docker en producción) detrás de un `StorageAdapter` (`apps/api/src/services/files.ts`) que puede cambiarse por S3/Supabase Storage. La descarga pasa por el API con los mismos permisos del proyecto.
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
│   │   │   ├── routes/           auth.ts, users.ts, projects.ts (+ members, systems, milestones, activity, search),
│   │   │   │                     components.ts, operations.ts (compras, pruebas, inspecciones, archivos, métricas)
│   │   │   ├── services/         components.ts, projects.ts (bundle), purchases.ts, tests.ts, inspections.ts,
│   │   │   │                     files.ts (StorageAdapter), metrics.ts
│   │   │   ├── app.ts            composición de la app, middlewares
│   │   │   └── index.ts          arranque: migraciones → admin inicial → servidor (+ SPA en prod)
│   │   └── build.mjs             bundle con esbuild → dist/index.js
│   └── web/                      SPA (React)
│       └── src/
│           ├── components/ui/    primitivos (button, input, dialog, dropdown, popover, command, table, …)
│           ├── components/domain/ badges, status-changer, component-table, component-form, pickers, activity-feed,
│           │                     manufacturing-form, files-card, purchase-form, test-form, inspection-dialog, system-form
│           ├── components/layout/ app-shell (sidebar, selector de proyecto, búsqueda Ctrl+K), global-search
│           ├── hooks/use-project.tsx  contexto del proyecto: bundle + mapas + bloqueos + permisos UI
│           ├── lib/              api.ts, queries.ts (TanStack Query), format.ts, alerts.ts, utils.ts
│           ├── pages/            login, projects, dashboard, components, component-detail, systems, system-detail,
│           │                     schedule, manufacturing, purchases, budget, tests, reports, metrics, activity,
│           │                     project-settings, users
│           └── App.tsx           rutas y guardas
├── packages/shared/src/          constants.ts (estados, transiciones, prioridades…), schemas.ts (zod), types.ts (DTOs), derived.ts
├── docker-compose.yml            db (dev) + app (perfil "app")
├── Dockerfile                    imagen de producción (API + SPA)
└── .env.example
```

Rutas del SPA: `/login`, `/projects`, `/users` (admin), `/p/:projectId` (dashboard), `/p/:projectId/components[/:id]`, `/systems[/:id]`, `/schedule`, `/manufacturing`, `/purchases`, `/budget`, `/tests`, `/reports`, `/metrics`, `/activity`, `/settings`. Los filtros de componentes viven en la URL (`?system=…&responsible=…&status=…&priority=…&flag=overdue|blocked|due_soon|open|done&material=…&before=YYYY-MM-DD&q=…`) → enlaces compartibles.

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
| `UPLOAD_DIR` | `uploads` | Carpeta de archivos subidos (en Docker: `/app/uploads`, volumen `rdms_uploads`) |
| `MAX_FILE_SIZE_MB` | `50` | Tamaño máximo por archivo |

## 8. Credenciales demo

Con `SEED_DEMO=true` se crea el proyecto **IREC 2027** (6 sistemas, 32 componentes con dependencias, costos, manufactura, 9 compras, 6 pruebas, 2 inspecciones e historial) y estos usuarios (contraseña `demo1234`):

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

**Agregar un módulo** (sigue el patrón de compras/pruebas):
1. Servicio en `apps/api/src/services/` con permisos (`lib/permissions.ts`) y `logActivity(...)` en cada mutación.
2. Rutas en `routes/operations.ts` (montado bajo `/api/projects/:projectId`, hereda `withProject`).
3. Si debe estar en el bundle, añádelo a `loadProjectBundle` + `ProjectBundle`; si no, un hook propio en `apps/web/src/lib/queries.ts`.
4. Página en `pages/`, ruta en `App.tsx`, entrada en el menú (`app-shell.tsx`).

**Cambiar el almacenamiento de archivos a S3/Supabase Storage**: implementa `StorageAdapter` (`save/open/remove`) en `services/files.ts` y asigna `storage = s3Adapter`. Nada más cambia.

**Agregar un reporte**: `pages/reports.tsx` → nueva entrada en `REPORTS` y un componente que use las funciones de `packages/shared` (`summarizeComponents`, `purchaseRisks`, `groupByMachine`, `computeCosts`…). Se imprime con el mismo botón.

**Agregar una métrica**: `services/metrics.ts` (servidor, usa el historial) + tarjeta en `pages/metrics.tsx`.

**Pendiente / ideas**: notificaciones por correo o WhatsApp (hoy las alertas son en la app), estados configurables por proyecto, métricas comparadas entre proyectos, exportar a Excel.

## Verificación

```bash
pnpm typecheck && pnpm build
```
Flujos cubiertos (navegador con Playwright y API con curl): login/logout, permisos por rol (403 en edición ajena, creación restringida por sistema, admin-only, subida de archivos solo a componentes propios), transiciones válidas/inválidas, bloqueo derivado y aviso de desbloqueo, ciclos de dependencias rechazados, filtros por URL y orden por "bloquea", búsqueda global (componentes, sistemas, compras, archivos, hitos, usuarios), historial automático, compras (crear, asociar, cambiar estado con fechas automáticas, críticas), inspecciones con transición automática, pruebas, subida/descarga/borrado de planos, reportes imprimibles, métricas, CRUD de usuarios/sistemas/hitos, cookies `HttpOnly/Secure/SameSite` y rechazo de `Origin` ajeno en producción.
