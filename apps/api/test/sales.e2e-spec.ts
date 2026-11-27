import { randomUUID } from 'node:crypto';
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

/** Sales, voids and customer returns (UC-30 … UC-33, docs/05 §4.11 and §5). */
describe('Sales', () => {
  let t: TestApp;
  let owner: Actor;
  let manager: Actor;
  let employee: Actor;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerOwner(t);
    manager = await addMember(t, owner.businessId, 'MANAGER');
    employee = await addMember(t, owner.businessId, 'EMPLOYEE');
  });
  afterAll(() => t.close());

  const key = () => randomUUID();
  const stocked = (quantity = '10', cost = '600', extra: Record<string, unknown> = {}) =>
    createProduct(t, owner, {
      sellingPrice: '1000',
      openingQuantity: quantity,
      openingUnitCost: cost,
      ...extra,
    });
  const stockOf = async (productId: string) => {
    const res = await t.http().get(`/api/v1/products/${productId}`).set(auth(owner)).expect(200);
    return res.body as { quantityOnHand: string; averageCost: string };
  };
  const sell = (actor: Actor, body: object, idempotencyKey: string | null = key()) => {
    const req = t.http().post('/api/v1/sales').set(auth(actor));
    if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
    return req.send(body);
  };
  const cash = (items: object[], extra: Record<string, unknown> = {}) => ({
    paymentMethod: 'CASH',
    items,
    ...extra,
  });

  it('records a sale: reference, server totals, change, cost snapshot and stock out', async () => {
    const p = await stocked('10', '600');
    const res = await sell(
      owner,
      cash([{ productId: p.id, quantity: '2', discountAmount: '100' }], {
        amountTendered: '2000',
        customerName: 'Aline',
        // Client totals are ignored (docs/05 §5).
        total: '1',
      }),
    ).expect(201);

    expect(res.body.reference).toMatch(/^SAL-\d{4}-\d{6}$/);
    expect(res.body).toMatchObject({
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      customerName: 'Aline',
      subtotal: '2000.00',
      discountTotal: '100.00',
      total: '1900.00',
      netTotal: '1900.00',
      amountTendered: '2000.00',
      changeDue: '100.00',
    });
    expect(res.body.items[0]).toMatchObject({
      productId: p.id,
      quantity: '2.000',
      unitPrice: '1000.00',
      discountAmount: '100.00',
      lineTotal: '1900.00',
      unitCost: '600.0000',
      quantityReturnable: '2.000',
    });
    expect(res.body.stockAfter).toEqual([
      { productId: p.id, quantityOnHand: '8.000', stockStatus: 'OK' },
    ]);
    expect((await stockOf(p.id)).quantityOnHand).toBe('8.000');

    const movements = await t
      .http()
      .get(`/api/v1/sales/${res.body.id}/movements`)
      .set(auth(owner))
      .expect(200);
    expect(movements.body.data).toHaveLength(1);
    expect(movements.body.data[0]).toMatchObject({
      type: 'SALE',
      quantityChange: '-2.000',
      quantityAfter: '8.000',
      documentRef: res.body.reference,
      saleId: res.body.id,
    });
  });

  it('flags a product that the sale took below its minimum', async () => {
    const p = await stocked('5', '100', { minStockLevel: '3' });
    const res = await sell(owner, cash([{ productId: p.id, quantity: '3' }])).expect(201);
    expect(res.body.stockAfter[0]).toMatchObject({ quantityOnHand: '2.000', stockStatus: 'LOW' });
  });

  it('requires an Idempotency-Key', async () => {
    const p = await stocked();
    const res = await sell(owner, cash([{ productId: p.id, quantity: '1' }]), null).expect(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('returns the original sale on a retry, and rejects the key with another body (I9)', async () => {
    const p = await stocked('10');
    const k = key();
    const body = cash([{ productId: p.id, quantity: '1' }]);
    const first = await sell(owner, body, k).expect(201);
    const retry = await sell(owner, body, k).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.reference).toBe(first.body.reference);
    expect(retry.body.stockAfter).toEqual(first.body.stockAfter);
    expect((await stockOf(p.id)).quantityOnHand).toBe('9.000');

    const other = await sell(owner, cash([{ productId: p.id, quantity: '2' }]), k).expect(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    // The same key from another cashier is a conflict too, not a way to read the sale.
    const otherUser = await sell(manager, body, k).expect(409);
    expect(otherUser.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('creates one sale when the same request arrives twice at once', async () => {
    const p = await stocked('10');
    const k = key();
    const body = cash([{ productId: p.id, quantity: '1' }]);
    const [a, b] = await Promise.all([sell(owner, body, k), sell(owner, body, k)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect((await stockOf(p.id)).quantityOnHand).toBe('9.000');
  });

  it('refuses a sale above the stock, naming the product, and writes nothing', async () => {
    const p = await stocked('3');
    const before = await t.prisma.sale.count({ where: { businessId: owner.businessId } });
    const res = await sell(owner, cash([{ productId: p.id, quantity: '5' }])).expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details[0]).toMatchObject({
      productId: p.id,
      available: '3.000',
      requested: '5.000',
    });
    expect(await t.prisma.sale.count({ where: { businessId: owner.businessId } })).toBe(before);
    expect((await stockOf(p.id)).quantityOnHand).toBe('3.000');
  });

  it('limits Employee discounts to employeeMaxDiscountPercent (5 % by default)', async () => {
    const p = await stocked('20');
    const over = await sell(
      employee,
      cash([{ productId: p.id, quantity: '1', discountAmount: '60' }]),
    ).expect(403);
    expect(over.body.error.code).toBe('DISCOUNT_NOT_ALLOWED');
    expect(over.body.error.details[0]).toMatchObject({
      productId: p.id,
      maxPercent: '5',
      requestedPercent: '6',
    });

    // A lower price is a discount too.
    const cheaper = await sell(
      employee,
      cash([{ productId: p.id, quantity: '1', unitPrice: '900' }]),
    );
    expect(cheaper.status).toBe(403);

    await sell(employee, cash([{ productId: p.id, quantity: '2', discountAmount: '100' }])).expect(
      201,
    );
    await sell(owner, cash([{ productId: p.id, quantity: '1', discountAmount: '500' }])).expect(
      201,
    );
  });

  it('validates amounts the server can check', async () => {
    const p = await stocked();
    const discount = await sell(
      owner,
      cash([{ productId: p.id, quantity: '1', discountAmount: '1500' }]),
    ).expect(400);
    expect(discount.body.error.details[0]).toMatchObject({
      path: 'items.0.discountAmount',
      message: 'sw.discountAboveLine',
    });

    const tendered = await sell(
      owner,
      cash([{ productId: p.id, quantity: '1' }], { amountTendered: '500' }),
    ).expect(400);
    expect(tendered.body.error.details[0]).toMatchObject({ path: 'amountTendered' });

    // Only cash gets change; other methods ignore the tendered amount.
    const mobile = await sell(owner, {
      paymentMethod: 'MOBILE_MONEY',
      amountTendered: '500',
      items: [{ productId: p.id, quantity: '1' }],
    }).expect(201);
    expect(mobile.body).toMatchObject({ amountTendered: null, changeDue: null });

    const duplicate = await sell(
      owner,
      cash([
        { productId: p.id, quantity: '1' },
        { productId: p.id, quantity: '1' },
      ]),
    ).expect(400);
    expect(duplicate.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses archived products and fractions of whole-unit products', async () => {
    const archived = await stocked();
    await t.http().post(`/api/v1/products/${archived.id}/archive`).set(auth(owner)).expect(200);
    const res = await sell(owner, cash([{ productId: archived.id, quantity: '1' }])).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    const whole = await stocked();
    const frac = await sell(owner, cash([{ productId: whole.id, quantity: '1.5' }])).expect(400);
    expect(frac.body.error.code).toBe('FRACTIONAL_QUANTITY_NOT_ALLOWED');

    const rice = await stocked('10', '600', { allowFractional: true, unit: 'kg' });
    const kg = await sell(owner, cash([{ productId: rice.id, quantity: '1.5' }])).expect(201);
    expect(kg.body.total).toBe('1500.00');
  });

  it('shows Employees only their own sales', async () => {
    const p = await stocked('10');
    const mine = await sell(employee, cash([{ productId: p.id, quantity: '1' }])).expect(201);
    const owners = await sell(owner, cash([{ productId: p.id, quantity: '1' }])).expect(201);

    const list = await t.http().get('/api/v1/sales?pageSize=100').set(auth(employee)).expect(200);
    const ids = list.body.data.map((s: { id: string }) => s.id);
    expect(ids).toContain(mine.body.id);
    expect(ids).not.toContain(owners.body.id);
    expect(
      list.body.data.every((s: { soldBy: { id: string } }) => s.soldBy.id === employee.userId),
    ).toBe(true);

    await t.http().get(`/api/v1/sales/${owners.body.id}`).set(auth(employee)).expect(404);
    await t.http().get(`/api/v1/sales/${mine.body.id}`).set(auth(employee)).expect(200);
    // An Employee can't widen the filter to someone else.
    const widened = await t
      .http()
      .get(`/api/v1/sales?userId=${owner.userId}`)
      .set(auth(employee))
      .expect(200);
    expect(widened.body.data.map((s: { id: string }) => s.id)).not.toContain(owners.body.id);

    const byEmployee = await t
      .http()
      .get(`/api/v1/sales?userId=${employee.userId}&pageSize=100`)
      .set(auth(owner))
      .expect(200);
    expect(byEmployee.body.data.map((s: { id: string }) => s.id)).toContain(mine.body.id);
    expect(byEmployee.body.data.map((s: { id: string }) => s.id)).not.toContain(owners.body.id);

    // Costs stay hidden from Employees.
    const detail = await t.http().get(`/api/v1/sales/${mine.body.id}`).set(auth(employee));
    expect(detail.body.items[0]).not.toHaveProperty('unitCost');
  });

  it('filters history by reference, product, status and payment method', async () => {
    const p = await stocked('10');
    const sale = await sell(owner, {
      paymentMethod: 'CARD',
      customerPhone: '+25779000111',
      items: [{ productId: p.id, quantity: '1' }],
    }).expect(201);
    const query = async (qs: string) =>
      (await t.http().get(`/api/v1/sales?${qs}`).set(auth(owner)).expect(200)).body.data.map(
        (s: { id: string }) => s.id,
      );
    expect(await query(`q=${sale.body.reference}`)).toEqual([sale.body.id]);
    expect(await query('q=79000111')).toEqual([sale.body.id]);
    expect(await query(`productId=${p.id}`)).toEqual([sale.body.id]);
    expect(await query('paymentMethod=CARD')).toContain(sale.body.id);
    expect(await query('paymentMethod=CASH')).not.toContain(sale.body.id);
    expect(await query('status=VOIDED')).not.toContain(sale.body.id);
  });

  describe('void (UC-32)', () => {
    it('puts the stock back at the original cost and refuses a second void', async () => {
      const p = await stocked('10', '600');
      const before = await stockOf(p.id);
      const sale = await sell(owner, cash([{ productId: p.id, quantity: '4' }])).expect(201);

      const employeeTry = await t
        .http()
        .post(`/api/v1/sales/${sale.body.id}/void`)
        .set(auth(employee))
        .send({ reason: 'mistake' })
        .expect(403);
      expect(employeeTry.body.error.code).toBe('FORBIDDEN');

      const res = await t
        .http()
        .post(`/api/v1/sales/${sale.body.id}/void`)
        .set(auth(manager))
        .send({ reason: 'Wrong product scanned' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'VOIDED',
        voidReason: 'Wrong product scanned',
        voidedBy: { id: manager.userId },
        netTotal: '0.00',
      });
      expect(res.body.items[0].quantityReturnable).toBe('0.000');
      const after = await stockOf(p.id);
      expect(after.quantityOnHand).toBe(before.quantityOnHand);
      expect(after.averageCost).toBe(before.averageCost);

      const movements = await t.prisma.stockMovement.findMany({
        where: { businessId: owner.businessId, saleId: sale.body.id },
        orderBy: { seq: 'asc' },
      });
      expect(movements.map((m) => m.type)).toEqual(['SALE', 'SALE_VOID']);
      expect(movements[1].reversalOfId).toBe(movements[0].id);
      expect(movements[1].quantityChange.toString()).toBe('4');

      const again = await t
        .http()
        .post(`/api/v1/sales/${sale.body.id}/void`)
        .set(auth(owner))
        .send({ reason: 'again' })
        .expect(409);
      expect(again.body.error.code).toBe('ALREADY_VOIDED');
    });

    it('requires a reason', async () => {
      const p = await stocked();
      const sale = await sell(owner, cash([{ productId: p.id, quantity: '1' }])).expect(201);
      await t
        .http()
        .post(`/api/v1/sales/${sale.body.id}/void`)
        .set(auth(owner))
        .send({ reason: ' ' })
        .expect(400);
    });
  });

  describe('customer returns (UC-33)', () => {
    let productId: string;
    let saleId: string;
    let itemId: string;
    const ret = (actor: Actor, lines: object[], k: string | null = key()) => {
      const req = t.http().post(`/api/v1/sales/${saleId}/returns`).set(auth(actor));
      if (k) req.set('Idempotency-Key', k);
      return req.send({ reason: 'DEFECTIVE', note: 'Broken seal', lines });
    };

    beforeAll(async () => {
      const p = await stocked('10', '600');
      productId = p.id;
      const sale = await sell(
        owner,
        cash([{ productId, quantity: '3', discountAmount: '100' }]),
      ).expect(201);
      saleId = sale.body.id;
      itemId = sale.body.items[0].id;
    });

    it('is for Owners and Managers only', async () => {
      const res = await ret(employee, [{ saleItemId: itemId, quantity: '1' }]).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns part of a line with a pro-rata refund, idempotently', async () => {
      const k = key();
      const res = await ret(manager, [{ saleItemId: itemId, quantity: '1' }], k).expect(200);
      // Line total 2900 for 3 units → 966.67 for one.
      expect(res.body).toMatchObject({
        status: 'PARTIALLY_RETURNED',
        returnedTotal: '966.67',
        netTotal: '1933.33',
      });
      expect(res.body.items[0]).toMatchObject({
        quantityReturned: '1.000',
        quantityReturnable: '2.000',
      });
      expect((await stockOf(productId)).quantityOnHand).toBe('8.000');

      await ret(manager, [{ saleItemId: itemId, quantity: '1' }], k).expect(200);
      expect((await stockOf(productId)).quantityOnHand).toBe('8.000');
      const conflict = await ret(manager, [{ saleItemId: itemId, quantity: '2' }], k).expect(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      const movement = await t.prisma.stockMovement.findFirstOrThrow({
        where: { businessId: owner.businessId, saleId, type: 'CUSTOMER_RETURN' },
      });
      expect(movement).toMatchObject({ reason: 'DEFECTIVE', note: 'Broken seal' });
      expect(movement.unitCost.toString()).toBe('600');
      expect(movement.documentRef).toMatch(/^RET-\d{4}-\d{6}$/);
    });

    it('refuses more than what is left to return', async () => {
      const res = await ret(owner, [{ saleItemId: itemId, quantity: '3' }]).expect(409);
      expect(res.body.error.code).toBe('OVER_RETURN');
      expect(res.body.error.details[0]).toMatchObject({ returnable: '2.000', requested: '3.000' });
    });

    it('can no longer void a sale with returns', async () => {
      const res = await t
        .http()
        .post(`/api/v1/sales/${saleId}/void`)
        .set(auth(owner))
        .send({ reason: 'x' })
        .expect(409);
      expect(res.body.error.code).toBe('HAS_RETURNS');
    });

    it('refunds exactly the sale total once everything is back', async () => {
      const res = await ret(owner, [{ saleItemId: itemId, quantity: '2' }]).expect(200);
      expect(res.body).toMatchObject({
        status: 'RETURNED',
        total: '2900.00',
        returnedTotal: '2900.00',
        netTotal: '0.00',
      });
      expect((await stockOf(productId)).quantityOnHand).toBe('10.000');
    });

    it('refuses returns on a voided sale and lines from another sale', async () => {
      const other = await sell(owner, cash([{ productId, quantity: '1' }])).expect(201);
      const notThisSale = await ret(owner, [
        { saleItemId: other.body.items[0].id, quantity: '1' },
      ]).expect(404);
      expect(notThisSale.body.error.code).toBe('NOT_FOUND');

      await t
        .http()
        .post(`/api/v1/sales/${other.body.id}/void`)
        .set(auth(owner))
        .send({ reason: 'x' })
        .expect(200);
      const res = await t
        .http()
        .post(`/api/v1/sales/${other.body.id}/returns`)
        .set(auth(owner))
        .send({ reason: 'OTHER', lines: [{ saleItemId: other.body.items[0].id, quantity: '1' }] })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  it('keeps every balance equal to its ledger (I1)', async () => {
    const res = await t.http().get('/api/v1/inventory/reconcile').set(auth(owner)).expect(200);
    expect(res.body.mismatches).toEqual([]);
  });
});
