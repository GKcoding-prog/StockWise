import {
  addMember,
  auth,
  createProduct,
  createTestApp,
  registerOwner,
  resetDatabase,
  type Actor,
  type TestApp,
} from './utils';
import { localDateOf } from '../src/common/time';

describe('Stock engine (docs/01 §7)', () => {
  let t: TestApp;
  let owner: Actor;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerOwner(t);
  });
  afterAll(() => t.close());

  const stockOf = async (productId: string) => {
    const res = await t.http().get(`/api/v1/products/${productId}`).set(auth(owner)).expect(200);
    return res.body as { quantityOnHand: string; averageCost: string; stockStatus: string };
  };
  const ledgerSum = async (productId: string) => {
    const agg = await t.prisma.stockMovement.aggregate({
      where: { businessId: owner.businessId, productId },
      _sum: { quantityChange: true },
    });
    return agg._sum.quantityChange?.toString() ?? '0';
  };

  it('writes an OPENING_BALANCE movement when a product is created with stock', async () => {
    const p = await createProduct(t, owner, { openingQuantity: '40', openingUnitCost: '1000' });
    const stock = await stockOf(p.id);
    expect(stock.quantityOnHand).toBe('40.000');
    expect(stock.averageCost).toBe('1000.0000');

    const ledger = await t
      .http()
      .get(`/api/v1/products/${p.id}/movements`)
      .set(auth(owner))
      .expect(200);
    expect(ledger.body.data).toHaveLength(1);
    expect(ledger.body.data[0]).toMatchObject({
      type: 'OPENING_BALANCE',
      quantityChange: '40.000',
      quantityBefore: '0.000',
      quantityAfter: '40.000',
    });
  });

  it('never accepts a quantity on product update (UC-10)', async () => {
    const p = await createProduct(t, owner, { openingQuantity: '5', openingUnitCost: '100' });
    const res = await t
      .http()
      .patch(`/api/v1/products/${p.id}`)
      .set(auth(owner))
      .send({ name: 'Renamed', quantityOnHand: '999' })
      .expect(400);
    expect(res.body.error.code).toBe('QUANTITY_NOT_EDITABLE');
    expect((await stockOf(p.id)).quantityOnHand).toBe('5.000');
  });

  it('records write-offs at the current average cost without changing it', async () => {
    const p = await createProduct(t, owner, { openingQuantity: '10', openingUnitCost: '250' });
    const res = await t
      .http()
      .post('/api/v1/inventory/write-offs')
      .set(auth(owner))
      .send({
        reason: 'DAMAGED',
        note: 'Broken in transport',
        lines: [{ productId: p.id, quantity: '3' }],
      })
      .expect(201);
    expect(res.body.documentRef).toMatch(/^WOF-\d{4}-000001$/);
    expect(res.body.movements[0]).toMatchObject({
      type: 'WRITE_OFF',
      quantityChange: '-3.000',
      quantityAfter: '7.000',
      unitCost: '250.0000',
      reason: 'DAMAGED',
    });
    expect((await stockOf(p.id)).averageCost).toBe('250.0000');
  });

  it('adjusts to a target quantity or by a difference, and skips counts that already match', async () => {
    const p = await createProduct(t, owner, { openingQuantity: '20', openingUnitCost: '100' });
    await t
      .http()
      .post('/api/v1/inventory/adjustments')
      .set(auth(owner))
      .send({ reason: 'COUNT_CORRECTION', lines: [{ productId: p.id, newQuantity: '17' }] })
      .expect(201);
    expect((await stockOf(p.id)).quantityOnHand).toBe('17.000');

    await t
      .http()
      .post('/api/v1/inventory/adjustments')
      .set(auth(owner))
      .send({ reason: 'FOUND', lines: [{ productId: p.id, quantityChange: '2' }] })
      .expect(201);
    expect((await stockOf(p.id)).quantityOnHand).toBe('19.000');

    const same = await t
      .http()
      .post('/api/v1/inventory/adjustments')
      .set(auth(owner))
      .send({ reason: 'COUNT_CORRECTION', lines: [{ productId: p.id, newQuantity: '19' }] })
      .expect(201);
    expect(same.body.movements).toHaveLength(0);
    expect(await ledgerSum(p.id)).toBe('19');
  });

  it('refuses to take stock below zero (INSUFFICIENT_STOCK) and leaves nothing half-written', async () => {
    const a = await createProduct(t, owner, { openingQuantity: '5', openingUnitCost: '100' });
    const b = await createProduct(t, owner, { openingQuantity: '1', openingUnitCost: '100' });
    const res = await t
      .http()
      .post('/api/v1/inventory/write-offs')
      .set(auth(owner))
      .send({
        reason: 'LOST',
        note: 'Missing after delivery',
        lines: [
          { productId: a.id, quantity: '2' },
          { productId: b.id, quantity: '3' },
        ],
      })
      .expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ productId: b.id, available: '1.000', requested: '3.000' }),
    ]);
    // Product a was in the same transaction: unchanged.
    expect((await stockOf(a.id)).quantityOnHand).toBe('5.000');
  });

  it('rejects fractional quantities for whole-unit products only', async () => {
    const whole = await createProduct(t, owner, { openingQuantity: '10', openingUnitCost: '100' });
    const res = await t
      .http()
      .post('/api/v1/inventory/write-offs')
      .set(auth(owner))
      .send({ reason: 'DAMAGED', note: 'x', lines: [{ productId: whole.id, quantity: '0.5' }] })
      .expect(400);
    expect(res.body.error.code).toBe('FRACTIONAL_QUANTITY_NOT_ALLOWED');

    const byWeight = await createProduct(t, owner, {
      unit: 'kg',
      allowFractional: true,
      openingQuantity: '12.5',
      openingUnitCost: '3600',
    });
    await t
      .http()
      .post('/api/v1/inventory/write-offs')
      .set(auth(owner))
      .send({
        reason: 'DAMAGED',
        note: 'Wet sack',
        lines: [{ productId: byWeight.id, quantity: '0.75' }],
      })
      .expect(201);
    expect((await stockOf(byWeight.id)).quantityOnHand).toBe('11.750');
  });

  it('previews a stock count with value impact, then commits one adjustment per difference', async () => {
    const a = await createProduct(t, owner, { openingQuantity: '10', openingUnitCost: '500' });
    const b = await createProduct(t, owner, { openingQuantity: '4', openingUnitCost: '200' });
    const body = {
      lines: [
        { productId: a.id, countedQuantity: '8' },
        { productId: b.id, countedQuantity: '4' },
      ],
    };
    const preview = await t
      .http()
      .post('/api/v1/inventory/counts/preview')
      .set(auth(owner))
      .send(body)
      .expect(200);
    expect(preview.body.differingLines).toBe(1);
    expect(preview.body.totalValueImpact).toBe('-1000');
    expect((await stockOf(a.id)).quantityOnHand).toBe('10.000'); // preview writes nothing

    const commit = await t
      .http()
      .post('/api/v1/inventory/counts/commit')
      .set(auth(owner))
      .send(body)
      .expect(201);
    expect(commit.body.documentRef).toMatch(/^CNT-/);
    expect(commit.body.movements).toHaveLength(1);
    expect(commit.body.movements[0]).toMatchObject({
      productId: a.id,
      quantityChange: '-2.000',
      reason: 'COUNT_CORRECTION',
    });
  });

  it('serialises concurrent stock-outs: 20 parallel requests on 10 units → exactly 10 succeed (§7.4)', async () => {
    const p = await createProduct(t, owner, { openingQuantity: '10', openingUnitCost: '1000' });
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        t
          .http()
          .post('/api/v1/inventory/write-offs')
          .set(auth(owner))
          .send({
            reason: 'OTHER',
            note: 'concurrency',
            lines: [{ productId: p.id, quantity: '1' }],
          }),
      ),
    );
    const ok = attempts.filter((r) => r.status === 201);
    const rejected = attempts.filter((r) => r.status === 409);
    expect(ok).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    expect(rejected.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);

    expect((await stockOf(p.id)).quantityOnHand).toBe('0.000');
    expect(await ledgerSum(p.id)).toBe('0');
    // Every movement saw the previous one's result: before/after form an unbroken chain.
    const chain = await t.prisma.stockMovement.findMany({
      where: { businessId: owner.businessId, productId: p.id },
      orderBy: { seq: 'asc' },
    });
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].quantityBefore.toString()).toBe(chain[i - 1].quantityAfter.toString());
    }
    const recon = await t.http().get('/api/v1/inventory/reconcile').set(auth(owner)).expect(200);
    expect(recon.body.mismatches).toEqual([]);
  });

  it('keeps the ledger append-only at the database level (I3)', async () => {
    const p = await createProduct(t, owner, { openingQuantity: '3', openingUnitCost: '10' });
    await expect(
      t.prisma.$executeRaw`DELETE FROM "stock_movements" WHERE "productId" = ${p.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      t.prisma
        .$executeRaw`UPDATE "stock_movements" SET "quantityChange" = 99 WHERE "productId" = ${p.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('values inventory at weighted average cost, now and as of a past date (docs/04 §9)', async () => {
    const shop = await registerOwner(t, 'Valuation Shop');
    const cat = await t
      .http()
      .post('/api/v1/categories')
      .set(auth(shop))
      .send({ name: 'Drinks' })
      .expect(201);
    await createProduct(t, shop, {
      categoryId: cat.body.id,
      openingQuantity: '40',
      openingUnitCost: '1000',
    });
    const p = await createProduct(t, shop, {
      openingQuantity: '2.5',
      allowFractional: true,
      unit: 'kg',
      openingUnitCost: '3600',
    });
    await t
      .http()
      .post('/api/v1/inventory/write-offs')
      .set(auth(shop))
      .send({ reason: 'DAMAGED', note: 'x', lines: [{ productId: p.id, quantity: '0.5' }] })
      .expect(201);

    const now = await t.http().get('/api/v1/analytics/valuation').set(auth(shop)).expect(200);
    expect(now.body.totalValue).toBe('47200.00'); // 40 × 1,000 + 2 × 3,600
    expect(now.body.byCategory[0]).toMatchObject({
      categoryName: 'Drinks',
      value: '40000.00',
      quantity: '40.000',
    });

    const today = localDateOf(new Date(), 'Africa/Bujumbura');
    const asOfToday = await t
      .http()
      .get(`/api/v1/analytics/valuation?asOf=${today}`)
      .set(auth(shop))
      .expect(200);
    expect(asOfToday.body.totalValue).toBe('47200.00');
    const before = await t
      .http()
      .get('/api/v1/analytics/valuation?asOf=2020-01-01')
      .set(auth(shop))
      .expect(200);
    expect(before.body.totalValue).toBe('0.00');

    const employee = await addMember(t, shop.businessId, 'EMPLOYEE');
    await t.http().get('/api/v1/analytics/valuation').set(auth(employee)).expect(403);
  });

  it('filters products and stock by computed status', async () => {
    const fresh = await registerOwner(t, 'Status Shop');
    await createProduct(t, fresh, { name: 'Out item' });
    await createProduct(t, fresh, {
      name: 'Low item',
      minStockLevel: '5',
      openingQuantity: '5',
      openingUnitCost: '1',
    });
    await createProduct(t, fresh, {
      name: 'Ok item',
      minStockLevel: '5',
      openingQuantity: '6',
      openingUnitCost: '1',
    });

    const low = await t.http().get('/api/v1/products?stockStatus=LOW').set(auth(fresh)).expect(200);
    expect(low.body.data.map((p: { name: string }) => p.name)).toEqual(['Low item']);
    const stock = await t.http().get('/api/v1/inventory/stock').set(auth(fresh)).expect(200);
    expect(stock.body.summary).toEqual({ OK: 1, LOW: 1, OUT: 1 });
  });
});
