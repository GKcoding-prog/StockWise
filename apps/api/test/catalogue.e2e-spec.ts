import {
  auth,
  createProduct,
  createTestApp,
  registerOwner,
  resetDatabase,
  type Actor,
  type TestApp,
} from './utils';

describe('Catalogue (UC-10, UC-12, UC-13)', () => {
  let t: TestApp;
  let owner: Actor;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    owner = await registerOwner(t);
  });
  afterAll(() => t.close());

  it('suggests a SKU from the name and rejects duplicate SKUs and barcodes', async () => {
    const first = await createProduct(t, owner, { name: 'Sucre blanc 1 kg' });
    const second = await createProduct(t, owner, { name: 'Sucre roux 1 kg' });
    expect(first.sku).toBe('SUC-0001');
    expect(second.sku).toBe('SUC-0002');

    const dupSku = await t
      .http()
      .post('/api/v1/products')
      .set(auth(owner))
      .send({ name: 'Other', sku: 'SUC-0001', sellingPrice: '1' })
      .expect(409);
    expect(dupSku.body.error.code).toBe('SKU_TAKEN');

    await createProduct(t, owner, { barcode: '2000000000015' });
    const dupBarcode = await t
      .http()
      .post('/api/v1/products')
      .set(auth(owner))
      .send({ name: 'Other', barcode: '2000000000015', sellingPrice: '1' })
      .expect(409);
    expect(dupBarcode.body.error.code).toBe('BARCODE_TAKEN');
  });

  it('finds products by name, SKU or exact barcode, and looks them up for the scanner', async () => {
    const p = await createProduct(t, owner, {
      name: 'Huile de palme 1 L',
      barcode: '2000000000060',
    });
    const byName = await t.http().get('/api/v1/products?q=palme').set(auth(owner)).expect(200);
    expect(byName.body.data.map((x: { id: string }) => x.id)).toContain(p.id);
    const byBarcode = await t
      .http()
      .get('/api/v1/products?q=2000000000060')
      .set(auth(owner))
      .expect(200);
    expect(byBarcode.body.data).toHaveLength(1);

    const lookup = await t
      .http()
      .get(`/api/v1/products/lookup?code=${p.sku.toLowerCase()}`)
      .set(auth(owner))
      .expect(200);
    expect(lookup.body.id).toBe(p.id);
  });

  it('hides archived products from search and the scanner, and can restore them', async () => {
    const p = await createProduct(t, owner, { name: 'Bougies', barcode: '2000000000077' });
    await t.http().post(`/api/v1/products/${p.id}/archive`).set(auth(owner)).expect(200);
    const list = await t.http().get('/api/v1/products?q=Bougies').set(auth(owner)).expect(200);
    expect(list.body.data).toHaveLength(0);
    await t.http().get('/api/v1/products/lookup?code=2000000000077').set(auth(owner)).expect(404);
    const archived = await t
      .http()
      .get('/api/v1/products?archived=true')
      .set(auth(owner))
      .expect(200);
    expect(archived.body.data.map((x: { id: string }) => x.id)).toContain(p.id);

    await t.http().post(`/api/v1/products/${p.id}/restore`).set(auth(owner)).expect(200);
    await t.http().get('/api/v1/products/lookup?code=2000000000077').set(auth(owner)).expect(200);
  });

  it('enforces unique category names, one level of nesting, and blocks archiving a category in use', async () => {
    const food = await t
      .http()
      .post('/api/v1/categories')
      .set(auth(owner))
      .send({ name: 'Food' })
      .expect(201);
    const dup = await t
      .http()
      .post('/api/v1/categories')
      .set(auth(owner))
      .send({ name: 'Food' })
      .expect(409);
    expect(dup.body.error.code).toBe('NAME_TAKEN');

    const grains = await t
      .http()
      .post('/api/v1/categories')
      .set(auth(owner))
      .send({ name: 'Grains', parentId: food.body.id })
      .expect(201);
    const tooDeep = await t
      .http()
      .post('/api/v1/categories')
      .set(auth(owner))
      .send({ name: 'Rice', parentId: grains.body.id })
      .expect(400);
    expect(tooDeep.body.error.code).toBe('VALIDATION_ERROR');

    await createProduct(t, owner, { categoryId: grains.body.id });
    const inUse = await t
      .http()
      .post(`/api/v1/categories/${grains.body.id}/archive`)
      .set(auth(owner))
      .expect(409);
    expect(inUse.body.error.code).toBe('CATEGORY_IN_USE');

    const list = await t.http().get('/api/v1/categories').set(auth(owner)).expect(200);
    const grainsRow = list.body.data.find((c: { id: string }) => c.id === grains.body.id);
    expect(grainsRow.productCount).toBe(1);
    expect(grainsRow.parent.name).toBe('Food');
  });

  it('manages suppliers with lead times and lists their products', async () => {
    const s = await t
      .http()
      .post('/api/v1/suppliers')
      .set(auth(owner))
      .send({ name: 'Brarudi', leadTimeDays: 2, phone: '+257 22 21 50 00' })
      .expect(201);
    expect(s.body.leadTimeDays).toBe(2);
    const dup = await t
      .http()
      .post('/api/v1/suppliers')
      .set(auth(owner))
      .send({ name: 'Brarudi' })
      .expect(409);
    expect(dup.body.error.code).toBe('NAME_TAKEN');

    const p = await createProduct(t, owner, { name: 'Primus 72 cl', defaultSupplierId: s.body.id });
    const products = await t
      .http()
      .get(`/api/v1/suppliers/${s.body.id}/products`)
      .set(auth(owner))
      .expect(200);
    expect(products.body.data.map((x: { id: string }) => x.id)).toEqual([p.id]);

    const detail = await t
      .http()
      .get(`/api/v1/suppliers/${s.body.id}`)
      .set(auth(owner))
      .expect(200);
    expect(detail.body.openPurchases).toEqual({ count: 0, value: '0.00' });
  });

  it('validates money and quantity formats on the server', async () => {
    const res = await t
      .http()
      .post('/api/v1/products')
      .set(auth(owner))
      .send({ name: 'Bad', sellingPrice: '12.345', minStockLevel: '-1' })
      .expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['sellingPrice', 'minStockLevel']));
  });

  it('records an audit trail for catalogue changes', async () => {
    const p = await createProduct(t, owner, { name: 'Audited' });
    await t
      .http()
      .patch(`/api/v1/products/${p.id}`)
      .set(auth(owner))
      .send({ sellingPrice: '1500' })
      .expect(200);
    const logs = await t.prisma.auditLog.findMany({
      where: { businessId: owner.businessId, entityId: p.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual(['product.create', 'product.update']);
    expect((logs[1].before as { sellingPrice: string }).sellingPrice).toBe('1000');
    expect((logs[1].after as { sellingPrice: string }).sellingPrice).toBe('1500');
    expect(logs[1].requestId).toBeTruthy();
  });
});
