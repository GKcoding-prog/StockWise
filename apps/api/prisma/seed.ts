/**
 * Seed: system roles + permissions (always), then a demo business with ~75 days of realistic
 * history for a Bujumbura shop (skipped if it already exists, or with SEED_DEMO=false).
 *
 * The history goes through the real stock engine (applyMovements) and reference generator, so
 * the ledger, weighted average costs and references are exactly what the app would produce.
 * Randomness is seeded, so every run produces the same shop.
 *
 * Demo logins (password Demo2026!): owner@demo.stockwise.bi, manager@…, cashier@…
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { D, ZERO, roundMoney } from '../src/common/decimal';
import { addDays, localDateOf, startOfLocalDay } from '../src/common/time';
import { PrismaClient, type PaymentMethod } from '../src/generated/prisma/client';
import { nextReference } from '../src/modules/inventory/document-sequence';
import { applyMovements, type EngineContext } from '../src/modules/inventory/stock-engine';
import { seedSystemRoles } from './seed-system';

const TZ = 'Africa/Bujumbura';
const DEMO_PASSWORD = 'Demo2026!';
const HISTORY_DAYS = 75;
const TX = { timeout: 120_000, maxWait: 10_000 };

// ── Deterministic randomness ─────────────────────────────────────────────────────────────────
let seed = 20261108;
function rand(): number {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
function poisson(lambda: number): number {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

/** EAN-13 in the in-store range (prefix 20), so it never collides with a real product. */
function ean13(n: number): string {
  const body = `20${String(n).padStart(10, '0')}`;
  const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

// ── Catalogue ────────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Alimentation',
  'Boissons',
  'Hygiène et beauté',
  'Entretien ménager',
  'Papeterie',
] as const;

const SUPPLIERS = [
  {
    key: 'brarudi',
    name: 'Brarudi — dépôt Rohero',
    contactName: 'Service commercial',
    phone: '+257 22 21 50 00',
    leadTimeDays: 2,
  },
  {
    key: 'kamenge',
    name: 'Grossiste Kamenge',
    contactName: 'Emmanuel Hakizimana',
    phone: '+257 79 41 22 10',
    leadTimeDays: 5,
  },
  {
    key: 'savonor',
    name: 'Savonor',
    contactName: 'Bureau des ventes',
    phone: '+257 22 22 31 64',
    leadTimeDays: 7,
  },
  {
    key: 'librairie',
    name: 'Librairie Saint-Paul (gros)',
    contactName: 'Claudine Ntakirutimana',
    phone: '+257 76 18 03 45',
    leadTimeDays: 4,
  },
] as const;
type SupplierKey = (typeof SUPPLIERS)[number]['key'];

interface ProductDef {
  name: string;
  sku: string;
  category: (typeof CATEGORIES)[number];
  supplier: SupplierKey;
  unit: string;
  fractional?: boolean;
  cost: number;
  price: number;
  min: number;
  pack?: number;
  /** Average units sold per day. */
  rate: number;
  opening: number;
  /** Stop reordering this many days before today (to show an out-of-stock product). */
  stopReorderDaysAgo?: number;
}

const PRODUCTS: ProductDef[] = [
  {
    name: 'Sucre blanc 1 kg',
    sku: 'ALI-0001',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'pcs',
    cost: 4800,
    price: 5500,
    min: 20,
    pack: 25,
    rate: 8,
    opening: 150,
  },
  {
    name: 'Riz Tanzanie 1 kg',
    sku: 'ALI-0002',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'pcs',
    cost: 3900,
    price: 4500,
    min: 30,
    pack: 25,
    rate: 9,
    opening: 160,
  },
  {
    name: 'Riz en vrac',
    sku: 'ALI-0003',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'kg',
    fractional: true,
    cost: 3600,
    price: 4200,
    min: 40,
    pack: 50,
    rate: 12,
    opening: 200,
  },
  {
    name: 'Haricots jaunes',
    sku: 'ALI-0004',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'kg',
    fractional: true,
    cost: 2800,
    price: 3400,
    min: 40,
    pack: 50,
    rate: 10,
    opening: 180,
  },
  {
    name: 'Farine de manioc',
    sku: 'ALI-0005',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'kg',
    fractional: true,
    cost: 1900,
    price: 2400,
    min: 30,
    pack: 50,
    rate: 7,
    opening: 120,
  },
  {
    name: 'Huile de palme 1 L',
    sku: 'ALI-0006',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'pcs',
    cost: 6500,
    price: 7500,
    min: 12,
    pack: 12,
    rate: 4,
    opening: 60,
  },
  {
    name: 'Sel iodé 500 g',
    sku: 'ALI-0007',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'pcs',
    cost: 600,
    price: 800,
    min: 20,
    pack: 50,
    rate: 3,
    opening: 100,
  },
  {
    name: 'Lait en poudre 400 g',
    sku: 'ALI-0008',
    category: 'Alimentation',
    supplier: 'kamenge',
    unit: 'pcs',
    cost: 9000,
    price: 10500,
    min: 3,
    rate: 0.12,
    opening: 24,
  },
  {
    name: 'Primus 72 cl',
    sku: 'BOI-0001',
    category: 'Boissons',
    supplier: 'brarudi',
    unit: 'pcs',
    cost: 2700,
    price: 3200,
    min: 24,
    pack: 12,
    rate: 14,
    opening: 120,
    stopReorderDaysAgo: 12,
  },
  {
    name: 'Amstel 50 cl',
    sku: 'BOI-0002',
    category: 'Boissons',
    supplier: 'brarudi',
    unit: 'pcs',
    cost: 2900,
    price: 3500,
    min: 24,
    pack: 24,
    rate: 8,
    opening: 96,
  },
  {
    name: 'Fanta Orange 30 cl',
    sku: 'BOI-0003',
    category: 'Boissons',
    supplier: 'brarudi',
    unit: 'pcs',
    cost: 1100,
    price: 1500,
    min: 24,
    pack: 24,
    rate: 10,
    opening: 96,
  },
  {
    name: 'Coca-Cola 30 cl',
    sku: 'BOI-0004',
    category: 'Boissons',
    supplier: 'brarudi',
    unit: 'pcs',
    cost: 1100,
    price: 1500,
    min: 24,
    pack: 24,
    rate: 9,
    opening: 96,
  },
  {
    name: 'Eau minérale 1,5 L',
    sku: 'BOI-0005',
    category: 'Boissons',
    supplier: 'brarudi',
    unit: 'pcs',
    cost: 900,
    price: 1300,
    min: 12,
    pack: 6,
    rate: 6,
    opening: 60,
  },
  {
    name: 'Savon de ménage 400 g',
    sku: 'ENT-0001',
    category: 'Entretien ménager',
    supplier: 'savonor',
    unit: 'pcs',
    cost: 1300,
    price: 1700,
    min: 25,
    pack: 25,
    rate: 6,
    opening: 125,
  },
  {
    name: 'Lessive en poudre 500 g',
    sku: 'ENT-0002',
    category: 'Entretien ménager',
    supplier: 'savonor',
    unit: 'pcs',
    cost: 2500,
    price: 3200,
    min: 10,
    pack: 20,
    rate: 3,
    opening: 60,
  },
  {
    name: 'Bougies (paquet de 6)',
    sku: 'ENT-0003',
    category: 'Entretien ménager',
    supplier: 'savonor',
    unit: 'pcs',
    cost: 1800,
    price: 2500,
    min: 5,
    rate: 0,
    opening: 40,
  },
  {
    name: 'Dentifrice 100 ml',
    sku: 'HYG-0001',
    category: 'Hygiène et beauté',
    supplier: 'savonor',
    unit: 'pcs',
    cost: 2200,
    price: 3000,
    min: 10,
    pack: 12,
    rate: 2,
    opening: 48,
  },
  {
    name: 'Papier hygiénique (rouleau)',
    sku: 'HYG-0002',
    category: 'Hygiène et beauté',
    supplier: 'savonor',
    unit: 'pcs',
    cost: 700,
    price: 1000,
    min: 20,
    pack: 48,
    rate: 4,
    opening: 96,
  },
  {
    name: 'Cahier 96 pages',
    sku: 'PAP-0001',
    category: 'Papeterie',
    supplier: 'librairie',
    unit: 'pcs',
    cost: 800,
    price: 1200,
    min: 20,
    pack: 50,
    rate: 4,
    opening: 100,
  },
  {
    name: 'Stylo à bille bleu',
    sku: 'PAP-0002',
    category: 'Papeterie',
    supplier: 'librairie',
    unit: 'pcs',
    cost: 250,
    price: 400,
    min: 30,
    pack: 50,
    rate: 5,
    opening: 150,
  },
];

const PAYMENT_WEIGHTS: [PaymentMethod, number][] = [
  ['CASH', 0.55],
  ['MOBILE_MONEY', 0.35],
  ['BANK_TRANSFER', 0.05],
  ['CARD', 0.03],
  ['OTHER', 0.02],
];
function paymentMethod(): PaymentMethod {
  let r = rand();
  for (const [method, weight] of PAYMENT_WEIGHTS) {
    if ((r -= weight) <= 0) return method;
  }
  return 'CASH';
}

// ── Seed ─────────────────────────────────────────────────────────────────────────────────────
async function seedDemo(prisma: PrismaClient, roleIds: Record<string, string>): Promise<void> {
  const ownerEmail = 'owner@demo.stockwise.bi';
  if (await prisma.user.findUnique({ where: { email: ownerEmail } })) {
    console.log('Demo business already present — skipping demo data.');
    return;
  }
  console.log('Creating demo business "Boutique Ubuntu"…');
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const today = localDateOf(new Date(), TZ);
  const now = new Date();
  const at = (daysAgo: number, hour: number, minute = 0) =>
    new Date(
      startOfLocalDay(addDays(today, -daysAgo), TZ).getTime() + (hour * 60 + minute) * 60_000,
    );

  // Business, people, catalogue
  const business = await prisma.business.create({
    data: {
      name: 'Boutique Ubuntu',
      legalName: 'Boutique Ubuntu SPRL',
      nif: '4001234567',
      address: 'Avenue de la Révolution 14, Rohero, Bujumbura',
      phone: '+257 79 00 12 34',
      currency: 'BIF',
      locale: 'fr',
      timezone: TZ,
      plan: 'BUSINESS',
      settings: {},
      createdAt: at(HISTORY_DAYS + 1, 9),
    },
  });
  const businessId = business.id;
  const warehouse = await prisma.warehouse.create({
    data: { businessId, name: 'Magasin principal', code: 'MAIN', isDefault: true },
  });
  const people = {
    owner: { email: ownerEmail, fullName: 'Aline Niyonzima', role: 'OWNER' },
    manager: {
      email: 'manager@demo.stockwise.bi',
      fullName: 'Jean-Claude Ndayishimiye',
      role: 'MANAGER',
    },
    cashier: { email: 'cashier@demo.stockwise.bi', fullName: 'Divine Irakoze', role: 'EMPLOYEE' },
  } as const;
  const userIds = {} as Record<keyof typeof people, string>;
  for (const [key, p] of Object.entries(people) as [
    keyof typeof people,
    (typeof people)[keyof typeof people],
  ][]) {
    const user = await prisma.user.create({
      data: {
        email: p.email,
        fullName: p.fullName,
        passwordHash,
        locale: 'fr',
        lastBusinessId: businessId,
      },
    });
    await prisma.businessMembership.create({
      data: { businessId, userId: user.id, roleId: roleIds[p.role] },
    });
    userIds[key] = user.id;
  }

  const categoryIds = new Map<string, string>();
  for (const name of CATEGORIES) {
    const c = await prisma.category.create({ data: { businessId, name } });
    categoryIds.set(name, c.id);
  }
  const supplierIds = new Map<SupplierKey, string>();
  for (const s of SUPPLIERS) {
    const { key, ...data } = s;
    const created = await prisma.supplier.create({ data: { businessId, ...data } });
    supplierIds.set(key, created.id);
  }
  const products: { def: ProductDef; id: string; onHand: number; cost: number }[] = [];
  for (const [i, def] of PRODUCTS.entries()) {
    const p = await prisma.product.create({
      data: {
        businessId,
        name: def.name,
        sku: def.sku,
        barcode: def.fractional ? null : ean13(i + 1),
        categoryId: categoryIds.get(def.category),
        defaultSupplierId: supplierIds.get(def.supplier),
        unit: def.unit,
        allowFractional: def.fractional ?? false,
        sellingPrice: D(def.price),
        costPrice: D(def.cost),
        minStockLevel: D(def.min),
        reorderMultiple: def.pack ? D(def.pack) : null,
        createdAt: at(HISTORY_DAYS, 8),
      },
    });
    products.push({ def, id: p.id, onHand: def.opening, cost: def.cost });
  }
  const leadTime = new Map(SUPPLIERS.map((s) => [s.key, s.leadTimeDays]));

  const engine = (userId: string, occurredAt: Date): EngineContext => ({
    businessId,
    userId,
    allowNegativeStock: false,
    occurredAt,
  });

  // Opening balances
  await prisma.$transaction(async (tx) => {
    await applyMovements(
      tx,
      engine(userIds.owner, at(HISTORY_DAYS, 8, 30)),
      products.map((p) => ({
        productId: p.id,
        warehouseId: warehouse.id,
        type: 'OPENING_BALANCE' as const,
        quantityChange: D(p.def.opening),
        unitCost: D(p.def.cost),
      })),
    );
  }, TX);

  // Day-by-day simulation: receipts in the morning, then the day's sales.
  type OpenOrder = {
    purchaseId: string;
    supplier: SupplierKey;
    receiveDaysAgo: number;
    items: { productIndex: number; itemId: string; qty: number; cost: number }[];
  };
  const openOrders: OpenOrder[] = [];
  let salesCount = 0;

  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    await prisma.$transaction(async (tx) => {
      // 1. Receive orders due today
      for (const order of openOrders.filter((o) => o.receiveDaysAgo === daysAgo)) {
        const receivedAt = at(daysAgo, 9, 15);
        if (receivedAt > now) continue;
        await applyMovements(
          tx,
          engine(pick([userIds.manager, userIds.cashier]), receivedAt),
          order.items.map((it) => ({
            productId: products[it.productIndex].id,
            warehouseId: warehouse.id,
            type: 'PURCHASE_RECEIPT' as const,
            quantityChange: D(it.qty),
            unitCost: D(it.cost),
            refs: { purchaseId: order.purchaseId, purchaseItemId: it.itemId },
          })),
        );
        for (const it of order.items) {
          await tx.purchaseItem.update({
            where: { id: it.itemId },
            data: { quantityReceived: D(it.qty) },
          });
          products[it.productIndex].onHand += it.qty;
          await tx.product.update({
            where: { id: products[it.productIndex].id },
            data: { costPrice: D(it.cost) },
          });
        }
        await tx.purchase.update({
          where: { id: order.purchaseId },
          data: { status: 'RECEIVED', receivedAt },
        });
        openOrders.splice(openOrders.indexOf(order), 1);
      }

      // 2. Reorder: one purchase per supplier when something reaches its reorder level
      for (const s of SUPPLIERS) {
        if (openOrders.some((o) => o.supplier === s.key)) continue;
        const lead = leadTime.get(s.key)!;
        const candidates = products
          .map((p, productIndex) => ({ p, productIndex }))
          .filter(({ p }) => p.def.supplier === s.key && p.def.rate > 0)
          .filter(({ p }) => !(p.def.stopReorderDaysAgo && daysAgo <= p.def.stopReorderDaysAgo));
        const needs = (p: (typeof products)[number]) =>
          p.onHand <= Math.max(p.def.min, Math.ceil(p.def.rate * (lead + 3)));
        if (!candidates.some(({ p }) => needs(p))) continue;

        const items = candidates
          .map(({ p, productIndex }) => {
            const target = Math.ceil(p.def.rate * (lead + 14 + 3));
            if (p.onHand >= target * 0.7) return null;
            const pack = p.def.pack ?? 1;
            const qty = Math.ceil((target - p.onHand) / pack) * pack;
            // Supplier prices drift up a little over the period (inflation).
            const cost = Math.round(
              p.def.cost *
                (1 + 0.04 * ((HISTORY_DAYS - daysAgo) / HISTORY_DAYS)) *
                (0.98 + rand() * 0.04),
            );
            return { productIndex, qty, cost };
          })
          .filter(
            (x): x is { productIndex: number; qty: number; cost: number } =>
              x !== null && x.qty > 0,
          );
        if (!items.length) continue;

        const orderedAt = at(daysAgo, 8, 0);
        const reference = await nextReference(tx, businessId, 'PURCHASE', TZ, orderedAt);
        const total = items.reduce((acc, it) => acc.plus(D(it.qty).times(it.cost)), ZERO);
        const purchase = await tx.purchase.create({
          data: {
            businessId,
            reference,
            supplierId: supplierIds.get(s.key)!,
            warehouseId: warehouse.id,
            status: 'ORDERED',
            orderedAt,
            expectedAt: at(daysAgo - lead, 9),
            total: roundMoney(total),
            createdById: userIds.manager,
            createdAt: orderedAt,
            items: {
              create: items.map((it) => ({
                businessId,
                productId: products[it.productIndex].id,
                quantityOrdered: D(it.qty),
                unitCost: D(it.cost),
                lineTotal: roundMoney(D(it.qty).times(it.cost)),
              })),
            },
          },
          include: { items: true },
        });
        openOrders.push({
          purchaseId: purchase.id,
          supplier: s.key,
          receiveDaysAgo: daysAgo - lead,
          items: items.map((it) => ({
            ...it,
            itemId: purchase.items.find((pi) => pi.productId === products[it.productIndex].id)!.id,
          })),
        });
      }

      // 3. Sales: customers buy a few lines each, Saturdays busier, Sundays quieter
      const weekday = new Date(`${addDays(today, -daysAgo)}T12:00:00Z`).getUTCDay();
      const dayFactor = weekday === 6 ? 1.35 : weekday === 0 ? 0.6 : 1;
      const lines: { productIndex: number; qty: number }[] = [];
      products.forEach((p, productIndex) => {
        const buyers = poisson((p.def.rate * dayFactor) / (p.def.fractional ? 1.6 : 1.5));
        for (let b = 0; b < buyers; b++) {
          const qty = p.def.fractional ? pick([0.5, 1, 1, 1.5, 2, 3]) : pick([1, 1, 1, 2, 2, 3]);
          lines.push({ productIndex, qty });
        }
      });
      lines.sort(() => rand() - 0.5);

      const sales: { productIndex: number; qty: number }[][] = [];
      while (lines.length) {
        const size = Math.min(lines.length, pick([1, 1, 2, 2, 3, 4]));
        const sale: { productIndex: number; qty: number }[] = [];
        for (const line of lines.splice(0, size)) {
          const same = sale.find((l) => l.productIndex === line.productIndex);
          if (same) same.qty += line.qty;
          else sale.push(line);
        }
        sales.push(sale);
      }
      const times = sales
        .map(() => at(daysAgo, 7, 30 + Math.floor(rand() * 690)))
        .sort((a, b) => a.getTime() - b.getTime());

      for (const [i, saleLines] of sales.entries()) {
        const soldAt = times[i];
        if (soldAt > now) break;
        const available = saleLines
          .map((l) => ({ ...l, qty: Math.min(l.qty, products[l.productIndex].onHand) }))
          .filter((l) => l.qty > 0);
        if (!available.length) continue;

        const discountLine = rand() < 0.05 ? 0 : -1;
        const items = available.map((l, idx) => {
          const p = products[l.productIndex];
          const unitPrice = D(p.def.price);
          const gross = unitPrice.times(l.qty);
          // Occasional 5% goodwill discount, rounded down to 100 BIF.
          const discount =
            idx === discountLine ? gross.times(0.05).dividedBy(100).floor().times(100) : ZERO;
          return {
            p,
            qty: D(l.qty),
            unitPrice,
            discount,
            lineTotal: roundMoney(gross.minus(discount)),
          };
        });
        const subtotal = items.reduce((acc, it) => acc.plus(it.unitPrice.times(it.qty)), ZERO);
        const discountTotal = items.reduce((acc, it) => acc.plus(it.discount), ZERO);
        const total = roundMoney(subtotal.minus(discountTotal));
        const method = paymentMethod();
        const tendered = method === 'CASH' ? total.dividedBy(5000).ceil().times(5000) : null;
        const seller =
          rand() < 0.7 ? userIds.cashier : rand() < 0.8 ? userIds.manager : userIds.owner;

        const reference = await nextReference(tx, businessId, 'SALE', TZ, soldAt);
        const sale = await tx.sale.create({
          data: {
            businessId,
            reference,
            warehouseId: warehouse.id,
            soldById: seller,
            paymentMethod: method,
            subtotal: roundMoney(subtotal),
            discountTotal,
            total,
            amountTendered: tendered,
            changeDue: tendered ? tendered.minus(total) : null,
            soldAt,
            createdAt: soldAt,
            items: {
              create: items.map((it) => ({
                businessId,
                productId: it.p.id,
                productName: it.p.def.name,
                quantity: it.qty,
                unitPrice: it.unitPrice,
                discountAmount: it.discount,
                lineTotal: it.lineTotal,
                unitCost: 0, // set from the movement's WAC below
              })),
            },
          },
          include: { items: true },
        });
        const movements = await applyMovements(
          tx,
          engine(seller, soldAt),
          sale.items.map((si) => ({
            productId: si.productId,
            warehouseId: warehouse.id,
            type: 'SALE' as const,
            quantityChange: si.quantity.negated(),
            refs: { saleId: sale.id, saleItemId: si.id },
          })),
        );
        for (const m of movements) {
          await tx.saleItem.update({
            where: { id: m.saleItemId! },
            data: { unitCost: m.unitCost },
          });
        }
        for (const it of items) it.p.onHand -= it.qty.toNumber();
        salesCount++;
      }

      // 4. A couple of write-offs and a count correction, as a real shop would have
      if (daysAgo === 20 || daysAgo === 9) {
        const isWriteOff = daysAgo === 20;
        const productIndex = isWriteOff ? 5 : 13; // huile de palme / savon
        const qty = isWriteOff ? 3 : 2;
        if (products[productIndex].onHand >= qty) {
          const occurredAt = at(daysAgo, 18, 10);
          const documentRef = await nextReference(
            tx,
            businessId,
            isWriteOff ? 'WRITE_OFF' : 'ADJUSTMENT',
            TZ,
            occurredAt,
          );
          await applyMovements(tx, engine(userIds.manager, occurredAt), [
            {
              productId: products[productIndex].id,
              warehouseId: warehouse.id,
              type: isWriteOff ? 'WRITE_OFF' : 'ADJUSTMENT',
              quantityChange: D(-qty),
              reason: isWriteOff ? 'DAMAGED' : 'COUNT_CORRECTION',
              note: isWriteOff
                ? 'Bouteilles cassées au déchargement'
                : 'Écart constaté à l’inventaire du soir',
              documentRef,
            },
          ]);
          products[productIndex].onHand -= qty;
        }
      }
    }, TX);
  }

  // A draft for next week, so every purchase status is represented.
  await prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx, businessId, 'PURCHASE', TZ);
    const items = [products[18], products[19]];
    await tx.purchase.create({
      data: {
        businessId,
        reference,
        supplierId: supplierIds.get('librairie')!,
        warehouseId: warehouse.id,
        status: 'DRAFT',
        notes: 'Rentrée scolaire — à confirmer',
        total: roundMoney(items.reduce((acc, p) => acc.plus(D(100).times(p.def.cost)), ZERO)),
        createdById: userIds.manager,
        items: {
          create: items.map((p) => ({
            businessId,
            productId: p.id,
            quantityOrdered: D(100),
            unitCost: D(p.def.cost),
            lineTotal: roundMoney(D(100).times(p.def.cost)),
          })),
        },
      },
    });
  }, TX);

  console.log(
    `  ${products.length} products, ${salesCount} sales, ${openOrders.length} purchase(s) still on order.`,
  );
  console.log(
    `  Logins (password ${DEMO_PASSWORD}): ${Object.values(people)
      .map((p) => p.email)
      .join(', ')}`,
  );
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const roleIds = await seedSystemRoles(prisma);
    console.log('System roles and permissions are up to date.');
    if (process.env.SEED_DEMO !== 'false') await seedDemo(prisma, roleIds);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
