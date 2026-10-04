import { isDoneStatus, statusOrder, type ComponentStatus, type Priority } from '@rdms/shared';
import { count, eq } from 'drizzle-orm';
import { env } from '../env.js';
import { hashPassword } from '../lib/password.js';
import { db, schema } from './index.js';

/** Creates the initial admin if the users table is empty. Optionally loads demo data. */
export async function ensureAdmin() {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (Number(n) > 0) return false;
  await db.insert(schema.users).values({
    email: env.ADMIN_EMAIL.toLowerCase(),
    name: env.ADMIN_NAME,
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    role: 'admin',
  });
  console.log(`Usuario administrador creado: ${env.ADMIN_EMAIL}`);
  if (env.SEED_DEMO) await seedDemo();
  return true;
}

const DEMO_PASSWORD = 'demo1234';
const DEMO_PROJECT_NAME = 'IREC 2027';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

type DemoComponent = {
  code: string;
  name: string;
  system: string;
  responsible: string;
  status: ComponentStatus;
  priority: Priority;
  due?: string;
  start?: string;
  qty?: number;
  description?: string;
  material?: string;
  materialQty?: number;
  materialUnit?: string;
  supplier?: string;
  materialStatus?: 'to_buy' | 'ordered' | 'available';
  est?: [material: number, manufacturing: number, shipping: number, additional: number];
  actual?: number;
  collaborators?: string[];
  dependsOn?: string[];
  manufacturing?: Partial<typeof schema.manufacturing.$inferInsert>;
};

export async function seedDemo() {
  const [existing] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.name, DEMO_PROJECT_NAME)).limit(1);
  if (existing) {
    console.log('El proyecto demo ya existe, se omite el seed.');
    return;
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ------------------------------------------------------------------ users
  const demoUsers = [
    { key: 'maria', name: 'María Fernández', email: 'maria@crater.ucr.ac.cr' },
    { key: 'pablo', name: 'Pablo Rodríguez', email: 'pablo@crater.ucr.ac.cr' },
    { key: 'ana', name: 'Ana Castro', email: 'ana@crater.ucr.ac.cr' },
    { key: 'carlos', name: 'Carlos Jiménez', email: 'carlos@crater.ucr.ac.cr' },
    { key: 'jose', name: 'José Mora', email: 'jose@crater.ucr.ac.cr' },
    { key: 'lucia', name: 'Lucía Vargas', email: 'lucia@crater.ucr.ac.cr' },
    { key: 'diego', name: 'Diego Solano', email: 'diego@crater.ucr.ac.cr' },
    { key: 'sofia', name: 'Sofía Herrera', email: 'sofia@crater.ucr.ac.cr' },
    { key: 'andres', name: 'Andrés Quesada', email: 'andres@crater.ucr.ac.cr', isActive: false },
  ];
  const users: Record<string, string> = {};
  for (const u of demoUsers) {
    const [row] = await db
      .insert(schema.users)
      .values({ name: u.name, email: u.email, passwordHash, role: 'member', isActive: u.isActive ?? true })
      .onConflictDoUpdate({ target: schema.users.email, set: { name: u.name } })
      .returning({ id: schema.users.id });
    users[u.key] = row.id;
  }

  // ---------------------------------------------------------------- project
  const [project] = await db
    .insert(schema.projects)
    .values({
      name: DEMO_PROJECT_NAME,
      description: 'Cohete experimental de propulsión sólida para la categoría 10k COTS/SRAD de la Spaceport America Cup 2027.',
      competition: 'Spaceport America Cup — IREC 2027',
      status: 'active',
      startDate: '2026-08-01',
      targetDate: '2027-06-20',
      budget: 8_500_000,
      currency: 'CRC',
    })
    .returning();
  const projectId = project.id;

  const memberships: [string, 'lead' | 'member'][] = [
    ['maria', 'lead'],
    ['pablo', 'member'],
    ['ana', 'member'],
    ['carlos', 'member'],
    ['jose', 'member'],
    ['lucia', 'member'],
    ['diego', 'member'],
    ['sofia', 'member'],
    ['andres', 'member'],
  ];
  await db.insert(schema.projectMembers).values(memberships.map(([k, role]) => ({ projectId, userId: users[k], role })));

  // ---------------------------------------------------------------- systems
  const systemDefs = [
    { code: 'AER', name: 'Aeroestructuras', budget: 1_800_000, lead: 'ana', members: ['diego'] },
    { code: 'PRO', name: 'Propulsión', budget: 2_500_000, lead: 'carlos', members: ['andres'] },
    { code: 'REC', name: 'Recuperación', budget: 1_200_000, lead: 'pablo', members: ['lucia'] },
    { code: 'AVI', name: 'Aviónica', budget: 1_500_000, lead: 'jose', members: ['sofia'] },
    { code: 'PAY', name: 'Payload', budget: 600_000, lead: 'lucia', members: [] },
    { code: 'SIM', name: 'Simulación', budget: 0, lead: 'maria', members: ['ana', 'diego'] },
  ];
  const systems: Record<string, string> = {};
  for (const [i, s] of systemDefs.entries()) {
    const [row] = await db
      .insert(schema.systems)
      .values({ projectId, code: s.code, name: s.name, budget: s.budget, sortOrder: i })
      .returning({ id: schema.systems.id });
    systems[s.code] = row.id;
    await db.insert(schema.systemMembers).values([
      { systemId: row.id, userId: users[s.lead], role: 'lead' },
      ...s.members.map((m) => ({ systemId: row.id, userId: users[m], role: 'member' as const })),
    ]);
  }

  // ------------------------------------------------------------- milestones
  await db.insert(schema.milestones).values([
    { projectId, name: 'SRR — System Requirements Review', date: '2026-09-15', completedAt: '2026-09-15' },
    { projectId, name: 'PDR — Preliminary Design Review', date: '2026-11-20' },
    { projectId, name: 'CDR — Critical Design Review', date: '2027-02-15' },
    { projectId, name: 'Prueba estática del motor', date: '2027-03-30' },
    { projectId, name: 'TRR — Test Readiness Review', date: '2027-04-30' },
    { projectId, name: 'Integración completa', date: '2027-05-20' },
    { projectId, name: 'Lanzamiento de prueba', date: '2027-05-30' },
    { projectId, name: 'Competencia IREC', date: '2027-06-20' },
  ]);

  // ------------------------------------------------------------- components
  const comps: DemoComponent[] = [
    // Aeroestructuras
    { code: 'AER-001', name: 'Tubo de fuselaje superior', system: 'AER', responsible: 'ana', status: 'design', priority: 'high', due: '2026-11-10', start: '2026-09-01', material: 'Fibra de carbono prepreg', materialQty: 2.5, materialUnit: 'm²', supplier: 'Rock West Composites', materialStatus: 'to_buy', est: [180_000, 60_000, 45_000, 25_000], description: 'Tubo de 6" OD para bahía de recuperación y aviónica.' },
    { code: 'AER-002', name: 'Tubo de fuselaje inferior', system: 'AER', responsible: 'diego', status: 'design_approved', priority: 'high', due: '2026-11-10', start: '2026-09-01', material: 'Fibra de carbono prepreg', materialQty: 3, materialUnit: 'm²', supplier: 'Rock West Composites', materialStatus: 'to_buy', est: [210_000, 60_000, 45_000, 30_000] },
    { code: 'AER-003', name: 'Cono de nariz', system: 'AER', responsible: 'diego', status: 'design', priority: 'medium', due: '2026-10-01', start: '2026-08-20', material: 'Fibra de vidrio + molde impreso', materialStatus: 'available', est: [45_000, 30_000, 0, 0], description: 'Ogiva Von Kármán 5:1.' },
    { code: 'AER-004', name: 'Aletas', system: 'AER', responsible: 'ana', status: 'design_approved', priority: 'critical', due: '2026-11-30', start: '2026-09-10', qty: 4, material: 'G10 / fibra de carbono', materialQty: 1, materialUnit: 'plancha', supplier: 'McMaster-Carr', materialStatus: 'to_buy', est: [95_000, 40_000, 18_000, 12_000], collaborators: ['diego'], manufacturing: { process: 'cnc', machine: 'Router CNC', workshop: 'Taller EIM', setupMinutes: 45, machineMinutes: 90, finishingMinutes: 120, inspectionMinutes: 20, needsWorkshop: true } },
    { code: 'AER-005', name: 'Acoplador (coupler)', system: 'AER', responsible: 'diego', status: 'idea', priority: 'medium', due: '2026-12-15', material: 'Fibra de carbono', est: [60_000, 25_000, 0, 0], dependsOn: ['AER-001', 'AER-002'] },
    { code: 'AER-006', name: 'Anillos de centrado del motor', system: 'AER', responsible: 'ana', status: 'pending_manufacturing', priority: 'high', due: '2026-10-20', start: '2026-09-15', qty: 3, material: 'Contrachapado aeronáutico 12 mm', materialStatus: 'available', est: [15_000, 10_000, 0, 0], dependsOn: ['PRO-001'], manufacturing: { process: 'cutting', machine: 'Cortadora láser', workshop: 'FabLab', setupMinutes: 15, machineMinutes: 30, finishingMinutes: 20, inspectionMinutes: 10, needsWorkshop: true } },
    { code: 'AER-007', name: 'Boattail', system: 'AER', responsible: 'diego', status: 'idea', priority: 'low', due: '2027-01-15', est: [30_000, 20_000, 0, 0] },

    // Propulsión
    { code: 'PRO-001', name: 'Carcasa del motor (motor case)', system: 'PRO', responsible: 'carlos', status: 'design', priority: 'critical', due: '2026-09-30', start: '2026-08-15', material: 'Aluminio 6061-T6, tubo 4" sch 40', materialQty: 1.2, materialUnit: 'm', supplier: 'Aceros Carazo', materialStatus: 'to_buy', est: [350_000, 120_000, 0, 0], description: 'Motor SRAD clase M. Presión de diseño 6.9 MPa, FS 2.' },
    { code: 'PRO-002', name: 'Tobera', system: 'PRO', responsible: 'carlos', status: 'design', priority: 'critical', due: '2026-10-30', start: '2026-09-01', material: 'Grafito isostático', materialStatus: 'to_buy', est: [260_000, 90_000, 35_000, 40_000], dependsOn: ['PRO-001'], manufacturing: { process: 'lathe', machine: 'Torno CNC', workshop: 'Taller EIM', setupMinutes: 60, machineMinutes: 240, finishingMinutes: 60, inspectionMinutes: 30, needsWorkshop: true } },
    { code: 'PRO-003', name: 'Grano propelente', system: 'PRO', responsible: 'carlos', status: 'idea', priority: 'high', due: '2027-02-01', material: 'APCP (AP, HTPB, Al)', materialStatus: 'to_buy', est: [420_000, 0, 60_000, 80_000], dependsOn: ['PRO-001', 'PRO-002'], collaborators: ['andres'] },
    { code: 'PRO-004', name: 'Bulkhead delantero del motor', system: 'PRO', responsible: 'carlos', status: 'design_approved', priority: 'high', due: '2026-10-25', start: '2026-09-05', material: 'Aluminio 6061-T6', materialStatus: 'available', est: [40_000, 35_000, 0, 0], dependsOn: ['PRO-001'], manufacturing: { process: 'lathe', machine: 'Torno convencional', workshop: 'Taller EIM', setupMinutes: 30, machineMinutes: 150, finishingMinutes: 20, inspectionMinutes: 15, needsWorkshop: true } },
    { code: 'PRO-005', name: 'Sistema de ignición', system: 'PRO', responsible: 'carlos', status: 'design', priority: 'medium', due: '2026-12-01', est: [45_000, 0, 10_000, 5_000] },
    { code: 'PRO-006', name: 'Banco de pruebas estático', system: 'PRO', responsible: 'andres', status: 'completed', priority: 'high', start: '2026-08-01', due: '2026-09-20', material: 'Perfil estructural + celda de carga 500 kgf', materialStatus: 'available', est: [280_000, 60_000, 30_000, 30_000], actual: 385_000, description: 'Banco horizontal con celda de carga y DAQ. Terminado por la generación 2025.' },

    // Recuperación
    { code: 'REC-001', name: 'Paracaídas principal', system: 'REC', responsible: 'pablo', status: 'design_approved', priority: 'critical', due: '2026-11-15', start: '2026-09-01', material: 'Nylon ripstop 1.1 oz', supplier: 'Fruity Chutes', materialStatus: 'ordered', est: [220_000, 0, 25_000, 32_000], description: 'Iris Ultra 72". Descenso 7 m/s con 25 kg.' },
    { code: 'REC-002', name: 'Paracaídas de drogue', system: 'REC', responsible: 'lucia', status: 'design_approved', priority: 'high', due: '2026-11-15', start: '2026-09-01', supplier: 'Fruity Chutes', materialStatus: 'available', est: [90_000, 0, 12_000, 14_000] },
    { code: 'REC-003', name: 'Bulkhead superior', system: 'REC', responsible: 'pablo', status: 'in_manufacturing', priority: 'high', due: '2026-10-10', start: '2026-09-10', material: 'Aluminio 6061-T6 Ø160 mm', materialStatus: 'available', est: [35_000, 40_000, 0, 0], dependsOn: ['AER-001'], manufacturing: { process: 'cnc', machine: 'Fresadora CNC Haas', workshop: 'Taller EIM', setupMinutes: 60, machineMinutes: 120, finishingMinutes: 30, inspectionMinutes: 15, scheduledDate: '2026-10-06', needsWorkshop: true } },
    { code: 'REC-004', name: 'Bulkhead inferior', system: 'REC', responsible: 'pablo', status: 'design', priority: 'critical', due: '2026-09-28', start: '2026-09-05', material: 'Aluminio 6061-T6 Ø160 mm', materialStatus: 'available', est: [35_000, 40_000, 0, 0], dependsOn: ['AER-002'], collaborators: ['lucia'], description: 'Incluye U-bolt y pasacables para el eyector.' },
    { code: 'REC-005', name: 'Eyector CO2', system: 'REC', responsible: 'lucia', status: 'design_approved', priority: 'high', due: '2026-11-01', start: '2026-09-15', supplier: 'Tinder Rocketry', materialStatus: 'to_buy', est: [130_000, 0, 15_000, 20_000], dependsOn: ['REC-004'] },
    { code: 'REC-006', name: 'Cordones y arnés (shock cords)', system: 'REC', responsible: 'lucia', status: 'pending_manufacturing', priority: 'medium', due: '2026-10-20', start: '2026-09-20', material: 'Kevlar tubular 1/2"', materialQty: 15, materialUnit: 'm', materialStatus: 'available', est: [45_000, 5_000, 0, 0], dependsOn: ['REC-004'], manufacturing: { process: 'manual', workshop: 'Laboratorio CRATER', setupMinutes: 10, machineMinutes: 0, finishingMinutes: 90, inspectionMinutes: 15 } },
    { code: 'REC-007', name: 'Sistema de separación', system: 'REC', responsible: 'pablo', status: 'design_approved', priority: 'critical', due: '2026-11-20', start: '2026-09-15', material: 'Tornillos de nylon 4-40 + cargas', materialStatus: 'to_buy', est: [20_000, 10_000, 0, 0], dependsOn: ['REC-004', 'AVI-001'] },
    { code: 'REC-008', name: 'Montaje del sistema de recuperación', system: 'REC', responsible: 'pablo', status: 'idea', priority: 'high', due: '2027-01-30', est: [0, 20_000, 0, 0], dependsOn: ['REC-001', 'REC-002', 'REC-003', 'REC-004', 'REC-005', 'REC-006', 'REC-007'], collaborators: ['lucia'] },

    // Aviónica
    { code: 'AVI-001', name: 'Computadora de vuelo', system: 'AVI', responsible: 'jose', status: 'design_approved', priority: 'critical', due: '2026-11-05', start: '2026-09-01', supplier: 'Altus Metrum', materialStatus: 'ordered', est: [150_000, 0, 18_000, 22_000], description: 'TeleMega v4 + GPS. Doble despliegue.' },
    { code: 'AVI-002', name: 'Altímetro COTS redundante', system: 'AVI', responsible: 'sofia', status: 'completed', priority: 'high', start: '2026-08-20', due: '2026-09-30', supplier: 'PerfectFlite', materialStatus: 'available', est: [90_000, 0, 10_000, 12_000], actual: 118_000 },
    { code: 'AVI-003', name: 'Baterías y arnés eléctrico', system: 'AVI', responsible: 'sofia', status: 'design', priority: 'medium', due: '2026-11-25', start: '2026-10-01', material: 'LiPo 2S 1000 mAh ×2, cable 22 AWG', materialStatus: 'to_buy', est: [40_000, 5_000, 6_000, 4_000] },
    { code: 'AVI-004', name: 'Bahía de aviónica (sled)', system: 'AVI', responsible: 'jose', status: 'design_approved', priority: 'high', due: '2026-11-10', start: '2026-09-20', material: 'PETG + varilla roscada 1/4"', materialStatus: 'available', est: [12_000, 8_000, 0, 0], dependsOn: ['REC-004'], manufacturing: { process: 'printing_3d', machine: 'Prusa MK4', workshop: 'Laboratorio CRATER', setupMinutes: 15, machineMinutes: 420, finishingMinutes: 30, inspectionMinutes: 10 } },
    { code: 'AVI-005', name: 'Telemetría (radio + antena)', system: 'AVI', responsible: 'sofia', status: 'idea', priority: 'medium', due: '2026-12-20', est: [110_000, 0, 12_000, 16_000] },
    { code: 'AVI-006', name: 'Firmware de vuelo', system: 'AVI', responsible: 'jose', status: 'design', priority: 'critical', due: '2027-01-20', start: '2026-09-15', est: [0, 0, 0, 0], collaborators: ['sofia'], dependsOn: ['AVI-001'] },

    // Payload
    { code: 'PAY-001', name: 'Estructura del payload (3U)', system: 'PAY', responsible: 'lucia', status: 'idea', priority: 'medium', due: '2027-01-10', material: 'Aluminio 6061 + PETG', est: [60_000, 40_000, 0, 0] },
    { code: 'PAY-002', name: 'Experimento científico', system: 'PAY', responsible: 'lucia', status: 'idea', priority: 'low', due: '2027-02-15', est: [120_000, 0, 15_000, 18_000] },

    // Simulación
    { code: 'SIM-001', name: 'Simulación de trayectoria (OpenRocket)', system: 'SIM', responsible: 'maria', status: 'completed', priority: 'high', start: '2026-08-05', due: '2026-09-10', est: [0, 0, 0, 0], actual: 0, description: 'Apogeo estimado 3 120 m con motor M1850.' },
    { code: 'SIM-002', name: 'Análisis estructural de aletas (FEA)', system: 'SIM', responsible: 'ana', status: 'design', priority: 'high', due: '2026-10-30', start: '2026-10-01', est: [0, 0, 0, 0], dependsOn: ['AER-004'] },
    { code: 'SIM-003', name: 'CFD del cono de nariz', system: 'SIM', responsible: 'diego', status: 'idea', priority: 'low', due: '2026-12-01', est: [0, 0, 0, 0] },
  ];

  const compIds: Record<string, string> = {};
  for (const c of comps) {
    const [row] = await db
      .insert(schema.components)
      .values({
        projectId,
        systemId: systems[c.system],
        code: c.code,
        name: c.name,
        description: c.description ?? null,
        quantity: c.qty ?? 1,
        responsibleId: users[c.responsible],
        priority: c.priority,
        status: c.status,
        startDate: c.start ?? null,
        dueDate: c.due ?? null,
        completedAt: isDoneStatus(c.status) ? daysAgo(12) : null,
        material: c.material ?? null,
        materialQty: c.materialQty ?? null,
        materialUnit: c.materialUnit ?? null,
        supplier: c.supplier ?? null,
        materialStatus: c.materialStatus ?? null,
        designerId: users[c.responsible],
        designApprovedAt: statusOrder(c.status) >= statusOrder('design_approved') ? daysAgo(20) : null,
        estMaterialCost: c.est?.[0] ?? 0,
        estManufacturingCost: c.est?.[1] ?? 0,
        estShippingCost: c.est?.[2] ?? 0,
        estAdditionalCost: c.est?.[3] ?? 0,
        actualCost: c.actual ?? null,
        createdBy: users['maria'],
        createdAt: daysAgo(40),
      })
      .returning({ id: schema.components.id });
    compIds[c.code] = row.id;
    if (c.collaborators?.length) {
      await db.insert(schema.componentMembers).values(c.collaborators.map((k) => ({ componentId: row.id, userId: users[k] })));
    }
    if (c.manufacturing) {
      await db.insert(schema.manufacturing).values({ componentId: row.id, responsibleId: users[c.responsible], ...c.manufacturing });
    }
  }
  for (const c of comps) {
    if (!c.dependsOn?.length) continue;
    await db.insert(schema.dependencies).values(c.dependsOn.map((dep) => ({ componentId: compIds[c.code], dependsOnId: compIds[dep] })));
  }

  // -------------------------------------------------------------- purchases
  const purchaseDefs = [
    { name: 'Paracaídas Iris Ultra 72"', supplier: 'Fruity Chutes', url: 'https://fruitychutes.com', quantity: 1, unitCost: 220_000, shippingCost: 25_000, additionalCost: 32_000, status: 'ordered', orderedAt: '2026-10-02', leadTimeDays: 21, expectedAt: '2026-10-23', requestedBy: 'maria', components: ['REC-001'] },
    { name: 'Paracaídas de drogue 24"', supplier: 'Fruity Chutes', quantity: 1, unitCost: 90_000, shippingCost: 12_000, additionalCost: 14_000, status: 'received', orderedAt: '2026-09-05', receivedAt: '2026-09-24', requestedBy: 'lucia', components: ['REC-002'] },
    { name: 'TeleMega v4 + GPS', supplier: 'Altus Metrum', url: 'https://altusmetrum.org', quantity: 1, unitCost: 150_000, shippingCost: 18_000, additionalCost: 22_000, status: 'in_transit', orderedAt: '2026-09-20', leadTimeDays: 18, expectedAt: '2026-10-08', requestedBy: 'jose', components: ['AVI-001'] },
    { name: 'StratoLoggerCF', supplier: 'PerfectFlite', quantity: 1, unitCost: 90_000, shippingCost: 10_000, additionalCost: 18_000, status: 'received', orderedAt: '2026-08-25', receivedAt: '2026-09-15', requestedBy: 'sofia', components: ['AVI-002'] },
    { name: 'Tubo aluminio 6061-T6 4" sch 40 × 1.5 m', supplier: 'Aceros Carazo', quantity: 1, unitCost: 95_000, shippingCost: 8_000, additionalCost: 0, status: 'to_buy', leadTimeDays: 10, requestedBy: 'carlos', components: ['PRO-001'] },
    { name: 'Plancha G10 1/8" 24×24"', supplier: 'McMaster-Carr', url: 'https://mcmaster.com', quantity: 1, unitCost: 68_000, shippingCost: 18_000, additionalCost: 12_000, status: 'to_buy', leadTimeDays: 25, requestedBy: 'ana', components: ['AER-004'] },
    { name: 'Eyector CO2 Peregrine 38 mm', supplier: 'Tinder Rocketry', quantity: 1, unitCost: 130_000, shippingCost: 15_000, additionalCost: 20_000, status: 'to_buy', leadTimeDays: 30, requestedBy: 'lucia', components: ['REC-005'] },
    { name: 'Fibra de carbono prepreg 2×2 twill (5 m²)', supplier: 'Rock West Composites', quantity: 5, unitCost: 78_000, shippingCost: 90_000, additionalCost: 55_000, status: 'to_buy', leadTimeDays: 35, requestedBy: 'ana', components: ['AER-001', 'AER-002'] },
    { name: 'Resina epóxica laminación 1 gal', supplier: 'Fiberglass CR', quantity: 2, unitCost: 32_000, shippingCost: 0, additionalCost: 0, status: 'received', orderedAt: '2026-09-10', receivedAt: '2026-09-12', requestedBy: 'diego', components: [] },
  ] as const;
  for (const p of purchaseDefs) {
    const [row] = await db
      .insert(schema.purchases)
      .values({
        projectId,
        name: p.name,
        supplier: p.supplier,
        url: 'url' in p ? p.url : null,
        quantity: p.quantity,
        unitCost: p.unitCost,
        shippingCost: p.shippingCost,
        additionalCost: p.additionalCost,
        status: p.status,
        leadTimeDays: 'leadTimeDays' in p ? p.leadTimeDays : null,
        orderedAt: 'orderedAt' in p ? p.orderedAt : null,
        expectedAt: 'expectedAt' in p ? p.expectedAt : null,
        receivedAt: 'receivedAt' in p ? p.receivedAt : null,
        requestedBy: users[p.requestedBy],
        createdAt: daysAgo(30),
      })
      .returning({ id: schema.purchases.id });
    if (p.components.length) await db.insert(schema.purchaseComponents).values(p.components.map((code) => ({ purchaseId: row.id, componentId: compIds[code] })));
  }

  // ------------------------------------------------------------------ tests
  await db.insert(schema.tests).values([
    { projectId, systemId: systems['PRO'], componentId: compIds['PRO-006'], name: 'Calibración de celda de carga', type: 'Funcional', date: '2026-09-18', responsibleId: users['andres'], objective: 'Verificar linealidad de la celda hasta 500 kgf con pesas patrón.', result: 'Error < 0.8 % en todo el rango.', status: 'passed' },
    { projectId, systemId: systems['AVI'], componentId: compIds['AVI-002'], name: 'Altímetro en cámara de vacío', type: 'Funcional', date: '2026-09-22', responsibleId: users['sofia'], objective: 'Simular ascenso a 3 000 m y verificar eventos de despliegue.', result: 'Eventos drogue/main disparados a las presiones esperadas.', status: 'passed' },
    { projectId, systemId: systems['REC'], componentId: compIds['REC-002'], name: 'Prueba de eyección en tierra (drogue)', type: 'Prueba de eyección', date: '2026-11-25', responsibleId: users['pablo'], objective: 'Separación limpia con 1.2 g de pólvora negra y tubo de 6".', status: 'planned' },
    { projectId, systemId: systems['AER'], componentId: compIds['AER-004'], name: 'Flexión de aleta hasta falla', type: 'Estructural', date: '2026-10-20', responsibleId: users['ana'], objective: 'Verificar que la aleta soporta 3× la carga aerodinámica estimada.', status: 'ready' },
    { projectId, systemId: systems['PRO'], componentId: null, name: 'Prueba estática motor M-class', type: 'Prueba estática', date: '2027-03-30', responsibleId: users['carlos'], objective: 'Curva empuje-tiempo, impulso total y presión de cámara.', status: 'planned' },
    { projectId, systemId: systems['AVI'], componentId: compIds['AVI-006'], name: 'Simulación HIL del firmware', type: 'Software', date: '2026-09-28', responsibleId: users['jose'], objective: 'Reproducir vuelo simulado y verificar máquina de estados.', result: 'Falla: el apogeo se detectó 0.8 s tarde con ruido barométrico.', status: 'failed', observations: 'Ajustar filtro y repetir.' },
  ]);

  // ------------------------------------------------------------ inspections
  await db.insert(schema.inspections).values([
    { componentId: compIds['AVI-002'], inspectorId: users['jose'], date: '2026-09-22', result: 'approved', observations: 'Firmware actualizado, conectores revisados.' },
    { componentId: compIds['PRO-006'], inspectorId: users['carlos'], date: '2026-09-20', result: 'approved_with_notes', observations: 'Repintar base; soldaduras OK.' },
  ]);

  // ---------------------------------------------------- activity (history)
  const label = (code: string) => `${code} ${comps.find((c) => c.code === code)!.name}`;
  const act = (
    daysBack: number,
    user: string,
    code: string,
    action: 'created' | 'updated' | 'status_changed' | 'dependency_added' | 'collaborator_added',
    changes: unknown,
    note?: string,
  ) => ({
    projectId,
    entityType: 'component' as const,
    entityId: compIds[code],
    entityLabel: label(code),
    userId: users[user],
    action,
    changes,
    note: note ?? null,
    createdAt: daysAgo(daysBack),
  });
  await db.insert(schema.activityLogs).values([
    { projectId, entityType: 'project', entityId: projectId, entityLabel: DEMO_PROJECT_NAME, userId: null, action: 'created', changes: null, note: null, createdAt: daysAgo(64) },
    act(40, 'maria', 'REC-003', 'created', [{ field: 'status', from: null, to: 'idea' }, { field: 'responsibleId', from: null, to: users['pablo'], toLabel: 'Pablo Rodríguez' }]),
    act(33, 'pablo', 'REC-003', 'status_changed', [{ field: 'status', from: 'idea', to: 'design' }]),
    act(25, 'pablo', 'REC-003', 'status_changed', [{ field: 'status', from: 'design', to: 'design_approved' }], 'Revisado con Ana: diámetro interno 152.4 mm confirmado.'),
    act(18, 'pablo', 'REC-003', 'status_changed', [{ field: 'status', from: 'design_approved', to: 'pending_manufacturing' }]),
    act(4, 'pablo', 'REC-003', 'status_changed', [{ field: 'status', from: 'pending_manufacturing', to: 'in_manufacturing' }], 'Material cortado, se maquina el martes en el Haas.'),
    act(9, 'ana', 'AER-004', 'updated', [{ field: 'estMaterialCost', from: 70_000, to: 95_000 }], 'Cotización de McMaster incluye envío.'),
    act(8, 'maria', 'REC-004', 'collaborator_added', [{ field: 'userId', from: null, to: users['lucia'], toLabel: 'Lucía Vargas' }]),
    act(7, 'carlos', 'PRO-001', 'updated', [{ field: 'dueDate', from: '2026-09-15', to: '2026-09-30' }], 'Se atrasó la cotización del tubo de aluminio.'),
    act(6, 'jose', 'AVI-004', 'dependency_added', [{ field: 'dependsOn', from: null, to: compIds['REC-004'], toLabel: label('REC-004') }]),
    act(12, 'sofia', 'AVI-002', 'status_changed', [{ field: 'status', from: 'inspection', to: 'completed' }], 'Altímetro probado en cámara de vacío.'),
    act(12, 'sofia', 'AVI-002', 'updated', [{ field: 'actualCost', from: null, to: 95_000 }]),
    act(2, 'maria', 'REC-001', 'updated', [{ field: 'materialStatus', from: 'to_buy', to: 'ordered' }], 'Pedido #FC-20931 a Fruity Chutes.'),
    act(1, 'lucia', 'REC-006', 'status_changed', [{ field: 'status', from: 'design_approved', to: 'pending_manufacturing' }]),
  ]);

  console.log(`Proyecto demo "${DEMO_PROJECT_NAME}" creado con ${comps.length} componentes.`);
  console.log(`Usuarios demo (contraseña: ${DEMO_PASSWORD}): ${demoUsers.map((u) => u.email).join(', ')}`);
}
