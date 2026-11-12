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

/**
 * Tenant isolation suite (docs/01 §6, layer 6): business A calls every endpoint with
 * business B's ids and must get 404 or an empty list. Grow this with every new endpoint.
 */
describe('Tenant isolation', () => {
  let t: TestApp;
  let a: Actor;
  let b: Actor;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    a = await registerOwner(t, 'Shop A');
    b = await registerOwner(t, 'Shop B');

    const category = await t
      .http()
      .post('/api/v1/categories')
      .set(auth(b))
      .send({ name: 'B secret' })
      .expect(201);
    const supplier = await t
      .http()
      .post('/api/v1/suppliers')
      .set(auth(b))
      .send({ name: 'B supplier' })
      .expect(201);
    const product = await createProduct(t, b, {
      name: 'B product',
      sku: 'B-SECRET',
      barcode: '2999999999999',
      categoryId: category.body.id,
      defaultSupplierId: supplier.body.id,
      openingQuantity: '10',
      openingUnitCost: '100',
    });
    const movement = await t.prisma.stockMovement.findFirstOrThrow({
      where: { businessId: b.businessId, productId: product.id },
    });
    const purchase = await t
      .http()
      .post('/api/v1/purchases')
      .set(auth(b))
      .send({
        supplierId: supplier.body.id,
        markOrdered: true,
        items: [{ productId: product.id, quantityOrdered: '5', unitCost: '100' }],
      })
      .expect(201);
    Object.assign(ids, {
      category: category.body.id,
      supplier: supplier.body.id,
      product: product.id,
      movement: movement.id,
      purchase: purchase.body.id,
      purchaseItem: purchase.body.items[0].id,
    });
    const aProduct = await createProduct(t, a, { name: 'A product' });
    const aSupplier = await t
      .http()
      .post('/api/v1/suppliers')
      .set(auth(a))
      .send({ name: 'A supplier' })
      .expect(201);
    Object.assign(ids, { aProduct: aProduct.id, aSupplier: aSupplier.body.id });
  });
  afterAll(() => t.close());

  type Row = [
    label: string,
    method: 'get' | 'post' | 'patch',
    path: () => string,
    body: (() => object) | null,
  ];
  const notFound: Row[] = [
    ['GET /products/{product}', 'get', () => `/api/v1/products/${ids.product}`, null],
    [
      'GET /products/{product}/movements',
      'get',
      () => `/api/v1/products/${ids.product}/movements`,
      null,
    ],
    [
      'PATCH /products/{product}',
      'patch',
      () => `/api/v1/products/${ids.product}`,
      () => ({ name: 'hijack' }),
    ],
    [
      'POST /products/{product}/archive',
      'post',
      () => `/api/v1/products/${ids.product}/archive`,
      null,
    ],
    [
      'POST /products/{product}/restore',
      'post',
      () => `/api/v1/products/${ids.product}/restore`,
      null,
    ],
    [
      'GET /products/lookup?code=B-SECRET',
      'get',
      () => `/api/v1/products/lookup?code=B-SECRET`,
      null,
    ],
    [
      'GET /products/lookup?code=2999999999999',
      'get',
      () => `/api/v1/products/lookup?code=2999999999999`,
      null,
    ],
    [
      'PATCH /categories/{category}',
      'patch',
      () => `/api/v1/categories/${ids.category}`,
      () => ({ name: 'hijack' }),
    ],
    [
      'POST /categories/{category}/archive',
      'post',
      () => `/api/v1/categories/${ids.category}/archive`,
      null,
    ],
    ['GET /suppliers/{supplier}', 'get', () => `/api/v1/suppliers/${ids.supplier}`, null],
    [
      'PATCH /suppliers/{supplier}',
      'patch',
      () => `/api/v1/suppliers/${ids.supplier}`,
      () => ({ name: 'hijack' }),
    ],
    [
      'POST /suppliers/{supplier}/archive',
      'post',
      () => `/api/v1/suppliers/${ids.supplier}/archive`,
      null,
    ],
    [
      'GET /suppliers/{supplier}/products',
      'get',
      () => `/api/v1/suppliers/${ids.supplier}/products`,
      null,
    ],
    [
      'GET /suppliers/{supplier}/purchases',
      'get',
      () => `/api/v1/suppliers/${ids.supplier}/purchases`,
      null,
    ],
    [
      'GET /inventory/movements/{movement}',
      'get',
      () => `/api/v1/inventory/movements/${ids.movement}`,
      null,
    ],
    [
      'POST /inventory/adjustments',
      'post',
      () => '/api/v1/inventory/adjustments',
      () => ({ reason: 'OTHER', lines: [{ productId: ids.product, quantityChange: '-5' }] }),
    ],
    [
      'POST /inventory/write-offs',
      'post',
      () => '/api/v1/inventory/write-offs',
      () => ({ reason: 'LOST', note: 'x', lines: [{ productId: ids.product, quantity: '1' }] }),
    ],
    [
      'POST /inventory/counts/preview',
      'post',
      () => '/api/v1/inventory/counts/preview',
      () => ({ lines: [{ productId: ids.product, countedQuantity: '0' }] }),
    ],
    [
      'POST /inventory/counts/commit',
      'post',
      () => '/api/v1/inventory/counts/commit',
      () => ({ lines: [{ productId: ids.product, countedQuantity: '0' }] }),
    ],
    [
      'POST /products with their category',
      'post',
      () => '/api/v1/products',
      () => ({ name: 'x', sellingPrice: '1', categoryId: ids.category }),
    ],
    [
      'POST /products with their supplier',
      'post',
      () => '/api/v1/products',
      () => ({ name: 'x', sellingPrice: '1', defaultSupplierId: ids.supplier }),
    ],
    [
      'POST /categories under their parent',
      'post',
      () => '/api/v1/categories',
      () => ({ name: 'child', parentId: ids.category }),
    ],
  ];

  const purchaseRows: Row[] = [
    ['GET /purchases/{purchase}', 'get', () => `/api/v1/purchases/${ids.purchase}`, null],
    [
      'GET /purchases/{purchase}/movements',
      'get',
      () => `/api/v1/purchases/${ids.purchase}/movements`,
      null,
    ],
    [
      'PATCH /purchases/{purchase}',
      'patch',
      () => `/api/v1/purchases/${ids.purchase}`,
      () => ({ notes: 'hijack' }),
    ],
    [
      'POST /purchases/{purchase}/order',
      'post',
      () => `/api/v1/purchases/${ids.purchase}/order`,
      null,
    ],
    [
      'POST /purchases/{purchase}/receive',
      'post',
      () => `/api/v1/purchases/${ids.purchase}/receive`,
      () => ({ lines: [{ purchaseItemId: ids.purchaseItem, quantity: '5' }] }),
    ],
    [
      'POST /purchases/{purchase}/cancel',
      'post',
      () => `/api/v1/purchases/${ids.purchase}/cancel`,
      () => ({ reason: 'hijack' }),
    ],
    [
      'POST /purchases/{purchase}/supplier-returns',
      'post',
      () => `/api/v1/purchases/${ids.purchase}/supplier-returns`,
      () => ({ reason: 'OTHER', lines: [{ purchaseItemId: ids.purchaseItem, quantity: '1' }] }),
    ],
    [
      'POST /purchases with their supplier',
      'post',
      () => '/api/v1/purchases',
      () => ({
        supplierId: ids.supplier,
        items: [{ productId: ids.aProduct, quantityOrdered: '1', unitCost: '1' }],
      }),
    ],
    [
      'POST /purchases with their product',
      'post',
      () => '/api/v1/purchases',
      () => ({
        supplierId: ids.aSupplier,
        items: [{ productId: ids.product, quantityOrdered: '1', unitCost: '1' }],
      }),
    ],
  ];
  notFound.push(...purchaseRows);

  it.each(notFound)('%s → 404 for another business', async (_label, method, path, body) => {
    // Idempotency-Key is required by some writes; send one everywhere so they reach the lookup.
    const req = t
      .http()
      [method](path())
      .set(auth(a))
      .set('Idempotency-Key', `isolation-${Math.random().toString(36).slice(2, 12)}`);
    const res = await (body ? req.send(body()) : req);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('never lists another business’s rows', async () => {
    const lists = [
      '/api/v1/products',
      '/api/v1/products?q=B',
      '/api/v1/categories',
      '/api/v1/suppliers',
      '/api/v1/inventory/stock',
      '/api/v1/inventory/movements',
      '/api/v1/warehouses',
      '/api/v1/purchases',
      `/api/v1/purchases?supplierId=${ids.supplier}`,
    ];
    for (const path of lists) {
      const res = await t.http().get(path).set(auth(a)).expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(ids.product);
      expect(text).not.toContain('B secret');
      expect(text).not.toContain('B supplier');
      expect(text).not.toContain(b.businessId);
    }
  });

  it('left business B untouched', async () => {
    const product = await t.http().get(`/api/v1/products/${ids.product}`).set(auth(b)).expect(200);
    expect(product.body.name).toBe('B product');
    expect(product.body.quantityOnHand).toBe('10.000');
    expect(product.body.archivedAt).toBeNull();
    const purchase = await t
      .http()
      .get(`/api/v1/purchases/${ids.purchase}`)
      .set(auth(b))
      .expect(200);
    expect(purchase.body).toMatchObject({ status: 'ORDERED', notes: null });
    expect(purchase.body.items[0].quantityReceived).toBe('0.000');
  });

  it('scopes a member to the business of the token, not of the request', async () => {
    const employeeOfB = await addMember(t, b.businessId, 'EMPLOYEE');
    const res = await t.http().get('/api/v1/products').set(auth(employeeOfB)).expect(200);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['B product']);
  });

  it('lets two businesses use the same SKU and category name', async () => {
    await createProduct(t, a, { sku: 'B-SECRET' });
    await t.http().post('/api/v1/categories').set(auth(a)).send({ name: 'B secret' }).expect(201);
  });
});
