import { randomUUID } from 'node:crypto';
import { localDateOf } from '../src/common/time';
import { addDays as addLocalDays } from '../src/common/time';
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

/** Purchases and receiving (UC-20 … UC-24, docs/05 §4.10). */
describe('Purchases', () => {
  let t: TestApp;
  let owner: Actor;
  let employee: Actor;
  let supplierId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerOwner(t);
    employee = await addMember(t, owner.businessId, 'EMPLOYEE');
    const supplier = await t
      .http()
      .post('/api/v1/suppliers')
      .set(auth(owner))
      .send({ name: 'Grossiste Rohero', leadTimeDays: 5 })
      .expect(201);
    supplierId = supplier.body.id;
  });
  afterAll(() => t.close());

  const key = () => randomUUID();
  const stockOf = async (productId: string) => {
    const res = await t.http().get(`/api/v1/products/${productId}`).set(auth(owner)).expect(200);
    return res.body as {
      quantityOnHand: string;
      averageCost: string;
      costPrice: string;
    };
  };
  const createPurchase = async (
    items: { productId: string; quantityOrdered: string; unitCost: string }[],
    extra: Record<string, unknown> = {},
  ) => {
    const res = await t
      .http()
      .post('/api/v1/purchases')
      .set(auth(owner))
      .send({ supplierId, items, ...extra });
    if (res.status !== 201) throw new Error(`createPurchase: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const receive = (
    actor: Actor,
    purchaseId: string,
    lines: object[],
    idempotencyKey: string | null = key(),
  ) => {
    const req = t.http().post(`/api/v1/purchases/${purchaseId}/receive`).set(auth(actor));
    if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
    return req.send({ lines });
  };

  it('creates a draft with a reference and computed totals, without touching stock (I6)', async () => {
    const p = await createProduct(t, owner, {
      openingQuantity: '10',
      openingUnitCost: '1000',
    });
    const purchase = await createPurchase([
      { productId: p.id, quantityOrdered: '24', unitCost: '1250' },
    ]);
    expect(purchase.reference).toMatch(/^PUR-\d{4}-\d{6}$/);
    expect(purchase.status).toBe('DRAFT');
    expect(purchase.total).toBe('30000.00');
    expect(purchase.items[0]).toMatchObject({
      quantityOrdered: '24.000',
      quantityReceived: '0.000',
      quantityRemaining: '24.000',
      unitCost: '1250.0000',
      lineTotal: '30000.00',
    });
    expect((await stockOf(p.id)).quantityOnHand).toBe('10.000');
  });

  it('edits a draft, replacing its lines and recomputing the total', async () => {
    const p1 = await createProduct(t, owner);
    const p2 = await createProduct(t, owner);
    const purchase = await createPurchase([
      { productId: p1.id, quantityOrdered: '5', unitCost: '100' },
    ]);
    const res = await t
      .http()
      .patch(`/api/v1/purchases/${purchase.id}`)
      .set(auth(owner))
      .send({
        notes: 'Call before delivery',
        items: [
          { productId: p1.id, quantityOrdered: '10', unitCost: '100' },
          { productId: p2.id, quantityOrdered: '3', unitCost: '2500.5' },
        ],
      })
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe('8501.50');
    expect(res.body.notes).toBe('Call before delivery');
  });

  it('treats an empty expected date from a form as "not set"', async () => {
    const p = await createProduct(t, owner);
    const purchase = await createPurchase(
      [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
      { expectedAt: '', notes: '' },
    );
    expect(purchase).toMatchObject({ status: 'DRAFT', expectedAt: null, notes: null });
  });

  it('only changes the fields a PATCH sends', async () => {
    const p = await createProduct(t, owner);
    const purchase = await createPurchase(
      [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
      { expectedAt: '2026-12-01', notes: 'Original note' },
    );
    const notesOnly = await t
      .http()
      .patch(`/api/v1/purchases/${purchase.id}`)
      .set(auth(owner))
      .send({ notes: 'New note' })
      .expect(200);
    expect(notesOnly.body.notes).toBe('New note');
    expect(notesOnly.body.expectedAt).toBe(purchase.expectedAt);

    const dateOnly = await t
      .http()
      .patch(`/api/v1/purchases/${purchase.id}`)
      .set(auth(owner))
      .send({ expectedAt: '' })
      .expect(200);
    expect(dateOnly.body.expectedAt).toBeNull();
    expect(dateOnly.body.notes).toBe('New note');
  });

  it('orders a draft with the expected date defaulting to today + supplier lead time', async () => {
    const p = await createProduct(t, owner);
    const purchase = await createPurchase([
      { productId: p.id, quantityOrdered: '1', unitCost: '1' },
    ]);
    const res = await t
      .http()
      .post(`/api/v1/purchases/${purchase.id}/order`)
      .set(auth(owner))
      .expect(200);
    expect(res.body.status).toBe('ORDERED');
    expect(res.body.orderedAt).not.toBeNull();
    const today = localDateOf(new Date(), 'Africa/Bujumbura');
    expect(localDateOf(new Date(res.body.expectedAt), 'Africa/Bujumbura')).toBe(
      addLocalDays(today, 5),
    );
  });

  it('receives partially, then fully, with weighted average cost (docs/04 §9 example)', async () => {
    const p = await createProduct(t, owner, {
      openingQuantity: '40',
      openingUnitCost: '1000',
    });
    const purchase = await createPurchase(
      [{ productId: p.id, quantityOrdered: '100', unitCost: '1200' }],
      { markOrdered: true },
    );
    expect(purchase.status).toBe('ORDERED');
    const itemId = purchase.items[0].id;

    // Partial receipt at the invoice cost, which differs from the ordered cost.
    const first = await receive(owner, purchase.id, [
      { purchaseItemId: itemId, quantity: '60', unitCost: '1250' },
    ]).expect(200);
    expect(first.body.status).toBe('PARTIALLY_RECEIVED');
    expect(first.body.items[0]).toMatchObject({
      quantityReceived: '60.000',
      quantityRemaining: '40.000',
      unitCost: '1250.0000',
    });
    expect(first.body.total).toBe('125000.00');
    let stock = await stockOf(p.id);
    expect(stock.quantityOnHand).toBe('100.000');
    expect(stock.averageCost).toBe('1150.0000'); // (40×1000 + 60×1250) / 100
    expect(stock.costPrice).toBe('1250.0000'); // last purchase cost pre-fills the next order

    const second = await receive(owner, purchase.id, [
      { purchaseItemId: itemId, quantity: '40' },
    ]).expect(200);
    expect(second.body.status).toBe('RECEIVED');
    expect(second.body.receivedAt).not.toBeNull();
    stock = await stockOf(p.id);
    expect(stock.quantityOnHand).toBe('140.000');
    // (100×1150 + 40×1250) / 140 = 1178.5714…
    expect(stock.averageCost).toBe('1178.5714');

    const ledger = await t
      .http()
      .get(`/api/v1/purchases/${purchase.id}/movements`)
      .set(auth(owner))
      .expect(200);
    expect(
      ledger.body.data.map((m: { type: string; quantityChange: string }) => [
        m.type,
        m.quantityChange,
      ]),
    ).toEqual([
      ['PURCHASE_RECEIPT', '40.000'],
      ['PURCHASE_RECEIPT', '60.000'],
    ]);
    expect(ledger.body.data[0].documentRef).toBe(purchase.reference);
  });

  it('rejects receiving more than remains, changing nothing', async () => {
    const p = await createProduct(t, owner);
    const purchase = await createPurchase(
      [{ productId: p.id, quantityOrdered: '10', unitCost: '50' }],
      {
        markOrdered: true,
      },
    );
    const res = await receive(owner, purchase.id, [
      { purchaseItemId: purchase.items[0].id, quantity: '11' },
    ]).expect(409);
    expect(res.body.error.code).toBe('OVER_RECEIPT');
    expect(res.body.error.details[0]).toMatchObject({
      remaining: '10.000',
      requested: '11.000',
    });
    expect((await stockOf(p.id)).quantityOnHand).toBe('0.000');
  });

  describe('idempotency (I9)', () => {
    it('requires an Idempotency-Key', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
        {
          markOrdered: true,
        },
      );
      const res = await receive(
        owner,
        purchase.id,
        [{ purchaseItemId: purchase.items[0].id, quantity: '1' }],
        null,
      ).expect(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('receives once when the same request is retried', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      const k = key();
      const lines = [{ purchaseItemId: purchase.items[0].id, quantity: '4' }];
      const a = await receive(owner, purchase.id, lines, k).expect(200);
      const b = await receive(owner, purchase.id, lines, k).expect(200);
      expect(b.body).toEqual(a.body);
      expect((await stockOf(p.id)).quantityOnHand).toBe('4.000');
    });

    it('receives once when retries arrive at the same time', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      const k = key();
      const lines = [{ purchaseItemId: purchase.items[0].id, quantity: '3' }];
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map(() => receive(owner, purchase.id, lines, k)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect((await stockOf(p.id)).quantityOnHand).toBe('3.000');
    });

    it('rejects the same key with different quantities', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      const k = key();
      const itemId = purchase.items[0].id;
      await receive(owner, purchase.id, [{ purchaseItemId: itemId, quantity: '2' }], k).expect(200);
      const res = await receive(
        owner,
        purchase.id,
        [{ purchaseItemId: itemId, quantity: '5' }],
        k,
      ).expect(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect((await stockOf(p.id)).quantityOnHand).toBe('2.000');
    });
  });

  it('never over-receives when two people receive the remainder at the same time', async () => {
    const p = await createProduct(t, owner);
    const purchase = await createPurchase(
      [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
      {
        markOrdered: true,
      },
    );
    const lines = [{ purchaseItemId: purchase.items[0].id, quantity: '10' }];
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => receive(owner, purchase.id, lines)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s !== 200).every((s) => s === 400 || s === 409)).toBe(true);
    expect((await stockOf(p.id)).quantityOnHand).toBe('10.000');
  });

  describe('status rules', () => {
    it('cannot receive a draft', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase([
        { productId: p.id, quantityOrdered: '1', unitCost: '1' },
      ]);
      const res = await receive(owner, purchase.id, [
        { purchaseItemId: purchase.items[0].id, quantity: '1' },
      ]).expect(400);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('cannot edit once goods were received', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '5', unitCost: '1' }],
        {
          markOrdered: true,
        },
      );
      await receive(owner, purchase.id, [
        { purchaseItemId: purchase.items[0].id, quantity: '1' },
      ]).expect(200);
      const res = await t
        .http()
        .patch(`/api/v1/purchases/${purchase.id}`)
        .set(auth(owner))
        .send({ notes: 'late edit' })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('cancelling a partial purchase closes the remainder but keeps received stock', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      await receive(owner, purchase.id, [
        { purchaseItemId: purchase.items[0].id, quantity: '4' },
      ]).expect(200);
      const res = await t
        .http()
        .post(`/api/v1/purchases/${purchase.id}/cancel`)
        .set(auth(owner))
        .send({ reason: 'Supplier out of stock' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Supplier out of stock',
      });
      expect(res.body.items[0]).toMatchObject({
        quantityReceived: '4.000',
        quantityRemaining: '0.000',
      });
      expect((await stockOf(p.id)).quantityOnHand).toBe('4.000');

      const again = await receive(owner, purchase.id, [
        { purchaseItemId: purchase.items[0].id, quantity: '1' },
      ]).expect(400);
      expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('cannot cancel a fully received purchase', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
        {
          markOrdered: true,
        },
      );
      await receive(owner, purchase.id, [
        { purchaseItemId: purchase.items[0].id, quantity: '1' },
      ]).expect(200);
      await t
        .http()
        .post(`/api/v1/purchases/${purchase.id}/cancel`)
        .set(auth(owner))
        .send({ reason: 'oops' })
        .expect(400);
    });
  });

  describe('validation', () => {
    it('rejects the same product twice in one purchase', async () => {
      const p = await createProduct(t, owner);
      await t
        .http()
        .post('/api/v1/purchases')
        .set(auth(owner))
        .send({
          supplierId,
          items: [
            { productId: p.id, quantityOrdered: '1', unitCost: '1' },
            { productId: p.id, quantityOrdered: '2', unitCost: '1' },
          ],
        })
        .expect(400);
    });

    it('rejects fractional quantities for whole-unit products', async () => {
      const p = await createProduct(t, owner);
      const res = await t
        .http()
        .post('/api/v1/purchases')
        .set(auth(owner))
        .send({
          supplierId,
          items: [{ productId: p.id, quantityOrdered: '1.5', unitCost: '1' }],
        })
        .expect(400);
      expect(res.body.error.code).toBe('FRACTIONAL_QUANTITY_NOT_ALLOWED');
    });

    it('accepts fractional quantities for products sold by weight', async () => {
      const rice = await createProduct(t, owner, {
        unit: 'kg',
        allowFractional: true,
      });
      const purchase = await createPurchase([
        { productId: rice.id, quantityOrdered: '25.5', unitCost: '3800' },
      ]);
      expect(purchase.total).toBe('96900.00');
    });

    it('rejects archived products and suppliers', async () => {
      const p = await createProduct(t, owner);
      await t.http().post(`/api/v1/products/${p.id}/archive`).set(auth(owner)).expect(200);
      await t
        .http()
        .post('/api/v1/purchases')
        .set(auth(owner))
        .send({
          supplierId,
          items: [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
        })
        .expect(404);

      const s = await t
        .http()
        .post('/api/v1/suppliers')
        .set(auth(owner))
        .send({ name: 'Old supplier' })
        .expect(201);
      await t.http().post(`/api/v1/suppliers/${s.body.id}/archive`).set(auth(owner)).expect(200);
      const p2 = await createProduct(t, owner);
      await t
        .http()
        .post('/api/v1/purchases')
        .set(auth(owner))
        .send({
          supplierId: s.body.id,
          items: [{ productId: p2.id, quantityOrdered: '1', unitCost: '1' }],
        })
        .expect(404);
    });
  });

  describe('employees (docs/03 §2)', () => {
    it('can receive goods but not create purchases or change costs, and see no costs', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      const itemId = purchase.items[0].id;

      await t
        .http()
        .post('/api/v1/purchases')
        .set(auth(employee))
        .send({
          supplierId,
          items: [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
        })
        .expect(403);

      const cost = await receive(employee, purchase.id, [
        { purchaseItemId: itemId, quantity: '1', unitCost: '90' },
      ]).expect(403);
      expect(cost.body.error.code).toBe('FORBIDDEN');

      const ok = await receive(employee, purchase.id, [
        { purchaseItemId: itemId, quantity: '5' },
      ]).expect(200);
      expect(ok.body.status).toBe('PARTIALLY_RECEIVED');
      expect(ok.body.total).toBeUndefined();
      expect(ok.body.items[0].unitCost).toBeUndefined();

      const list = await t.http().get('/api/v1/purchases').set(auth(employee)).expect(200);
      expect(list.body.data.every((row: object) => !('total' in row))).toBe(true);
    });
  });

  describe('supplier returns (UC-24)', () => {
    it('sends received goods back, within what was received', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '10', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      const itemId = purchase.items[0].id;
      await receive(owner, purchase.id, [{ purchaseItemId: itemId, quantity: '10' }]).expect(200);

      const over = await t
        .http()
        .post(`/api/v1/purchases/${purchase.id}/supplier-returns`)
        .set(auth(owner))
        .send({
          reason: 'DAMAGED',
          lines: [{ purchaseItemId: itemId, quantity: '11' }],
        })
        .expect(409);
      expect(over.body.error.code).toBe('OVER_RETURN');

      const ok = await t
        .http()
        .post(`/api/v1/purchases/${purchase.id}/supplier-returns`)
        .set(auth(owner))
        .send({
          reason: 'DAMAGED',
          note: 'Crushed boxes',
          lines: [{ purchaseItemId: itemId, quantity: '3' }],
        })
        .expect(200);
      expect(ok.body.items[0].quantityReturned).toBe('3.000');
      expect((await stockOf(p.id)).quantityOnHand).toBe('7.000');

      const ledger = await t
        .http()
        .get(`/api/v1/purchases/${purchase.id}/movements`)
        .set(auth(owner))
        .expect(200);
      expect(ledger.body.data[0]).toMatchObject({
        type: 'SUPPLIER_RETURN',
        quantityChange: '-3.000',
        reason: 'DAMAGED',
      });
      expect(ledger.body.data[0].documentRef).toMatch(/^SRT-\d{4}-\d{6}$/);
    });

    it('cannot return goods that have already left the shop', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '5', unitCost: '100' }],
        {
          markOrdered: true,
        },
      );
      const itemId = purchase.items[0].id;
      await receive(owner, purchase.id, [{ purchaseItemId: itemId, quantity: '5' }]).expect(200);
      await t
        .http()
        .post('/api/v1/inventory/write-offs')
        .set(auth(owner))
        .send({
          reason: 'DAMAGED',
          note: 'Water damage',
          lines: [{ productId: p.id, quantity: '4' }],
        })
        .expect(201);

      const res = await t
        .http()
        .post(`/api/v1/purchases/${purchase.id}/supplier-returns`)
        .set(auth(owner))
        .send({
          reason: 'DAMAGED',
          lines: [{ purchaseItemId: itemId, quantity: '3' }],
        })
        .expect(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('is not allowed for employees', async () => {
      const p = await createProduct(t, owner);
      const purchase = await createPurchase(
        [{ productId: p.id, quantityOrdered: '1', unitCost: '1' }],
        {
          markOrdered: true,
        },
      );
      await t
        .http()
        .post(`/api/v1/purchases/${purchase.id}/supplier-returns`)
        .set(auth(employee))
        .send({
          reason: 'OTHER',
          lines: [{ purchaseItemId: purchase.items[0].id, quantity: '1' }],
        })
        .expect(403);
    });
  });

  it('lists purchases with filters', async () => {
    const res = await t
      .http()
      .get('/api/v1/purchases?status=RECEIVED&pageSize=100')
      .set(auth(owner))
      .expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((p: { status: string }) => p.status === 'RECEIVED')).toBe(true);
    expect(res.body.data[0].supplier.name).toBe('Grossiste Rohero');
  });

  it('leaves every stock balance equal to its ledger (invariant I1)', async () => {
    const res = await t.http().get('/api/v1/inventory/reconcile').set(auth(owner)).expect(200);
    expect(res.body.mismatches).toEqual([]);
  });
});
