/**
 * Database seed — safe to run many times (idempotent).
 *
 * 1. Always: permission catalogue + system roles (OWNER, MANAGER, EMPLOYEE).
 * 2. Development only: a demo mini-market with users, categories, suppliers and
 *    products with opening stock, so the UI has realistic data from day one.
 *    Prices are illustrative demo values in BIF, not market data.
 *
 * Run: pnpm db:seed
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_ROLES, type SystemRole } from '@stockwise/shared';
import { PrismaClient, type User } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://stockwise:stockwise@localhost:5432/stockwise',
  }),
});

const ROLE_NAMES: Record<SystemRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

async function seedAccessControl(): Promise<Record<SystemRole, string>> {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  const permissionIds = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id] as const),
  );

  const roleIds = {} as Record<SystemRole, string>;
  for (const key of SYSTEM_ROLES) {
    // System roles have businessId = null (unique via a partial index).
    const role =
      (await prisma.role.findFirst({ where: { key, businessId: null } })) ??
      (await prisma.role.create({ data: { key, name: ROLE_NAMES[key], isSystem: true } }));
    roleIds[key] = role.id;

    // Make the role's permissions match the shared matrix exactly.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[key].map((p) => ({
        roleId: role.id,
        permissionId: permissionIds.get(p)!,
      })),
    });
  }
  console.log(`✔ ${permissionIds.size} permissions, ${SYSTEM_ROLES.length} system roles`);
  return roleIds;
}

const DEMO_PASSWORD = 'Demo1234!';
const DEMO_USERS: { email: string; fullName: string; role: SystemRole }[] = [
  { email: 'owner@demo.stockwise.bi', fullName: 'Aline Niyonzima', role: 'OWNER' },
  { email: 'manager@demo.stockwise.bi', fullName: 'Eric Ndayishimiye', role: 'MANAGER' },
  { email: 'employee@demo.stockwise.bi', fullName: 'Grace Irakoze', role: 'EMPLOYEE' },
];

const CATEGORIES = ['Alimentation', 'Boissons', 'Hygiène', 'Entretien ménager', 'Papeterie'];

const SUPPLIERS = [
  { name: 'Grossiste Rohero', city: 'Bujumbura', phone: '+257 22 00 00 01', leadTimeDays: 3 },
  { name: 'Distribution Ngozi Plus', city: 'Ngozi', phone: '+257 22 00 00 02', leadTimeDays: 7 },
  { name: 'Papeterie Centrale', city: 'Bujumbura', phone: '+257 22 00 00 03', leadTimeDays: 5 },
];

type DemoProduct = {
  sku: string;
  name: string;
  category: string;
  supplier: string;
  unit: string;
  allowFractional?: boolean;
  cost: number;
  price: number;
  min: number;
  opening: number;
  pack?: number;
};

const PRODUCTS: DemoProduct[] = [
  {
    sku: 'ALI-001',
    name: 'Sucre 1 kg',
    category: 'Alimentation',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 4200,
    price: 5000,
    min: 20,
    opening: 50,
    pack: 25,
  },
  {
    sku: 'ALI-002',
    name: 'Riz local (vrac)',
    category: 'Alimentation',
    supplier: 'Distribution Ngozi Plus',
    unit: 'kg',
    allowFractional: true,
    cost: 3800,
    price: 4500,
    min: 25,
    opening: 120,
  },
  {
    sku: 'ALI-003',
    name: 'Haricots secs (vrac)',
    category: 'Alimentation',
    supplier: 'Distribution Ngozi Plus',
    unit: 'kg',
    allowFractional: true,
    cost: 3000,
    price: 3600,
    min: 20,
    opening: 80,
  },
  {
    sku: 'ALI-004',
    name: 'Farine de manioc 1 kg',
    category: 'Alimentation',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 2500,
    price: 3000,
    min: 15,
    opening: 40,
  },
  {
    sku: 'ALI-005',
    name: 'Huile de palme 1 L',
    category: 'Alimentation',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 6500,
    price: 7500,
    min: 10,
    opening: 24,
    pack: 12,
  },
  {
    sku: 'ALI-006',
    name: 'Sel iodé 1 kg',
    category: 'Alimentation',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 900,
    price: 1200,
    min: 10,
    opening: 30,
  },
  {
    sku: 'ALI-007',
    name: 'Lait en poudre 400 g',
    category: 'Alimentation',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 9000,
    price: 10500,
    min: 6,
    opening: 5,
  },
  {
    sku: 'BOI-001',
    name: 'Eau minérale 1,5 L',
    category: 'Boissons',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 900,
    price: 1200,
    min: 24,
    opening: 60,
    pack: 6,
  },
  {
    sku: 'BOI-002',
    name: "Jus d'ananas 1 L",
    category: 'Boissons',
    supplier: 'Distribution Ngozi Plus',
    unit: 'pcs',
    cost: 2800,
    price: 3500,
    min: 12,
    opening: 0,
    pack: 12,
  },
  {
    sku: 'HYG-001',
    name: 'Savon de toilette',
    category: 'Hygiène',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 1100,
    price: 1500,
    min: 20,
    opening: 45,
  },
  {
    sku: 'HYG-002',
    name: 'Dentifrice 100 ml',
    category: 'Hygiène',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 2600,
    price: 3200,
    min: 8,
    opening: 18,
  },
  {
    sku: 'ENT-001',
    name: 'Savon de ménage (barre)',
    category: 'Entretien ménager',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 1400,
    price: 1800,
    min: 20,
    opening: 15,
  },
  {
    sku: 'ENT-002',
    name: 'Bougies (paquet de 6)',
    category: 'Entretien ménager',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 2000,
    price: 2500,
    min: 10,
    opening: 22,
  },
  {
    sku: 'ENT-003',
    name: 'Allumettes (paquet de 10)',
    category: 'Entretien ménager',
    supplier: 'Grossiste Rohero',
    unit: 'pcs',
    cost: 700,
    price: 1000,
    min: 10,
    opening: 35,
  },
  {
    sku: 'PAP-001',
    name: 'Cahier 96 pages',
    category: 'Papeterie',
    supplier: 'Papeterie Centrale',
    unit: 'pcs',
    cost: 1200,
    price: 1500,
    min: 30,
    opening: 100,
    pack: 10,
  },
  {
    sku: 'PAP-002',
    name: 'Stylo à bille bleu',
    category: 'Papeterie',
    supplier: 'Papeterie Centrale',
    unit: 'pcs',
    cost: 300,
    price: 500,
    min: 50,
    opening: 200,
    pack: 50,
  },
];

async function seedDemoBusiness(roleIds: Record<SystemRole, string>): Promise<void> {
  const owner = await prisma.user.findUnique({
    where: { email: DEMO_USERS[0].email },
    include: { memberships: true },
  });
  if (owner?.memberships.length) {
    console.log('✔ Demo business already present — skipped');
    return;
  }

  const passwordHash = await hash(DEMO_PASSWORD);

  await prisma.$transaction(async (tx) => {
    const users: User[] = [];
    for (const u of DEMO_USERS) {
      users.push(
        await tx.user.upsert({
          where: { email: u.email },
          update: {},
          create: {
            email: u.email,
            fullName: u.fullName,
            passwordHash,
            locale: 'fr',
            emailVerifiedAt: new Date(),
          },
        }),
      );
    }
    const ownerUser = users[0];

    const business = await tx.business.create({
      data: {
        name: 'Alimentation Kira (démo)',
        city: 'Bujumbura',
        address: 'Avenue de la Démo 1, Rohero',
        phone: '+257 22 00 00 00',
        currency: 'BIF',
        locale: 'fr',
        timezone: 'Africa/Bujumbura',
        plan: 'BUSINESS',
      },
    });

    await tx.businessMembership.createMany({
      data: DEMO_USERS.map((u, i) => ({
        businessId: business.id,
        userId: users[i].id,
        roleId: roleIds[u.role],
        invitedById: i === 0 ? null : ownerUser.id,
      })),
    });

    const warehouse = await tx.warehouse.create({
      data: { businessId: business.id, name: 'Boutique principale', code: 'MAIN', isDefault: true },
    });

    const categoryIds = new Map<string, string>();
    for (const name of CATEGORIES) {
      const c = await tx.category.create({ data: { businessId: business.id, name } });
      categoryIds.set(name, c.id);
    }

    const supplierIds = new Map<string, string>();
    for (const s of SUPPLIERS) {
      const created = await tx.supplier.create({
        data: { businessId: business.id, country: 'BI', ...s },
      });
      supplierIds.set(s.name, created.id);
    }

    for (const p of PRODUCTS) {
      const product = await tx.product.create({
        data: {
          businessId: business.id,
          sku: p.sku,
          name: p.name,
          categoryId: categoryIds.get(p.category),
          defaultSupplierId: supplierIds.get(p.supplier),
          unit: p.unit,
          allowFractional: p.allowFractional ?? false,
          purchasePrice: p.cost,
          sellingPrice: p.price,
          minStockLevel: p.min,
          reorderMultiple: p.pack,
        },
      });

      // Opening stock goes through the ledger like every other stock change:
      // one OPENING_BALANCE movement + the matching StockLevel balance.
      await tx.stockLevel.create({
        data: {
          businessId: business.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantityOnHand: p.opening,
          averageCost: p.opening > 0 ? p.cost : 0,
          lastMovementAt: p.opening > 0 ? new Date() : null,
        },
      });
      if (p.opening > 0) {
        await tx.stockMovement.create({
          data: {
            businessId: business.id,
            productId: product.id,
            warehouseId: warehouse.id,
            type: 'OPENING_BALANCE',
            quantityChange: p.opening,
            quantityBefore: 0,
            quantityAfter: p.opening,
            unitCost: p.cost,
            averageCostAfter: p.cost,
            reason: 'Stock initial (données de démonstration)',
            userId: ownerUser.id,
          },
        });
      }
    }
  });

  console.log(`✔ Demo business with ${PRODUCTS.length} products`);
  console.log(
    `  Logins (password "${DEMO_PASSWORD}"): ${DEMO_USERS.map((u) => u.email).join(', ')}`,
  );
}

async function main(): Promise<void> {
  const roleIds = await seedAccessControl();
  if (process.env.NODE_ENV === 'production') {
    console.log('Production: demo data not created.');
    return;
  }
  await seedDemoBusiness(roleIds);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
