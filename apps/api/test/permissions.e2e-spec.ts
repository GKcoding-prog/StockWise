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

/** Permission matrix (docs/03 §2), enforced by the API regardless of the UI. */
describe('Role permissions', () => {
  let t: TestApp;
  let owner: Actor;
  let manager: Actor;
  let employee: Actor;
  let productId: string;
  let supplierId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerOwner(t);
    manager = await addMember(t, owner.businessId, 'MANAGER');
    employee = await addMember(t, owner.businessId, 'EMPLOYEE');
    productId = (
      await createProduct(t, owner, {
        openingQuantity: '50',
        openingUnitCost: '700',
        costPrice: '700',
      })
    ).id;
    supplierId = (
      await t.http().post('/api/v1/suppliers').set(auth(owner)).send({ name: 'Perm supplier' })
    ).body.id;
  });
  afterAll(() => t.close());

  const cases: [
    string,
    'get' | 'post' | 'patch',
    string | (() => string),
    unknown,
    { owner: number; manager: number; employee: number },
  ][] = [
    [
      'create product',
      'post',
      '/api/v1/products',
      { name: 'P', sellingPrice: '1' },
      { owner: 201, manager: 201, employee: 403 },
    ],
    [
      'edit product',
      'patch',
      () => `/api/v1/products/${productId}`,
      { description: 'x' },
      { owner: 200, manager: 200, employee: 403 },
    ],
    [
      'create category',
      'post',
      '/api/v1/categories',
      null,
      { owner: 201, manager: 201, employee: 403 },
    ],
    [
      'create supplier',
      'post',
      '/api/v1/suppliers',
      null,
      { owner: 201, manager: 201, employee: 403 },
    ],
    [
      'view suppliers',
      'get',
      '/api/v1/suppliers',
      null,
      { owner: 200, manager: 200, employee: 200 },
    ],
    [
      'adjust stock',
      'post',
      '/api/v1/inventory/adjustments',
      () => ({ reason: 'FOUND', lines: [{ productId, quantityChange: '1' }] }),
      { owner: 201, manager: 201, employee: 403 },
    ],
    [
      'write off',
      'post',
      '/api/v1/inventory/write-offs',
      () => ({ reason: 'DAMAGED', note: 'x', lines: [{ productId, quantity: '1' }] }),
      { owner: 201, manager: 201, employee: 201 },
    ],
    [
      'view movements',
      'get',
      '/api/v1/inventory/movements',
      null,
      { owner: 200, manager: 200, employee: 200 },
    ],
    [
      'reconcile',
      'get',
      '/api/v1/inventory/reconcile',
      null,
      { owner: 200, manager: 403, employee: 403 },
    ],
    [
      'edit business',
      'patch',
      '/api/v1/business',
      { phone: '+257 1' },
      { owner: 200, manager: 403, employee: 403 },
    ],
    [
      'edit settings',
      'patch',
      '/api/v1/business/settings',
      { employeeMaxDiscountPercent: 10 },
      { owner: 200, manager: 403, employee: 403 },
    ],
    [
      'view plan',
      'get',
      '/api/v1/business/plan',
      null,
      { owner: 200, manager: 403, employee: 403 },
    ],
    [
      'list purchases',
      'get',
      '/api/v1/purchases',
      null,
      { owner: 200, manager: 200, employee: 200 },
    ],
    [
      'create purchase',
      'post',
      '/api/v1/purchases',
      () => ({ supplierId, items: [{ productId, quantityOrdered: '1', unitCost: '700' }] }),
      { owner: 201, manager: 201, employee: 403 },
    ],
  ];

  let n = 0;
  it.each(cases)('%s', async (_name, method, path, body, expected) => {
    for (const [role, actor] of [
      ['owner', owner],
      ['manager', manager],
      ['employee', employee],
    ] as const) {
      const unique = { name: `Item ${role} ${++n}` };
      const payload = typeof body === 'function' ? body() : (body ?? unique);
      const url = typeof path === 'function' ? path() : path;
      const req = t.http()[method](url).set(auth(actor));
      const res = method === 'get' ? await req : await req.send(payload as object);
      expect({ role, status: res.status }).toEqual({ role, status: expected[role] });
      if (res.status === 403) expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('hides cost fields from employees but shows them to managers', async () => {
    const asEmployee = await t
      .http()
      .get(`/api/v1/products/${productId}`)
      .set(auth(employee))
      .expect(200);
    expect(asEmployee.body).not.toHaveProperty('averageCost');
    expect(asEmployee.body).not.toHaveProperty('costPrice');
    expect(asEmployee.body).not.toHaveProperty('stockValue');

    const movements = await t
      .http()
      .get('/api/v1/inventory/movements')
      .set(auth(employee))
      .expect(200);
    expect(movements.body.data[0]).not.toHaveProperty('unitCost');

    const asManager = await t
      .http()
      .get(`/api/v1/products/${productId}`)
      .set(auth(manager))
      .expect(200);
    expect(asManager.body.averageCost).toBe('700.0000');
    expect(asManager.body.costPrice).toBe('700.0000');
  });

  it('exposes the role’s permissions on /me for the UI', async () => {
    const me = await t.http().get('/api/v1/me').set(auth(employee)).expect(200);
    expect(me.body.role.key).toBe('EMPLOYEE');
    expect(me.body.permissions).toEqual(
      expect.arrayContaining(['sales.create', 'purchases.receive', 'inventory.write_off']),
    );
    expect(me.body.permissions).not.toContain('products.view_cost');
  });
});
