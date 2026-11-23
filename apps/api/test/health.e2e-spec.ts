import { createTestApp, type TestApp } from './utils';

describe('Health endpoints and proxy trust', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Read when the app boots (env() is cached per test file).
    process.env.TRUST_PROXY = '2';
    process.env.SHOW_CLIENT_IP = 'true';
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
    delete process.env.TRUST_PROXY;
    delete process.env.SHOW_CLIENT_IP;
  });

  it('GET /health pings the database', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('GET /health/live answers without auth', async () => {
    const res = await t.http().get('/api/v1/health/live').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('trusts exactly TRUST_PROXY hops of X-Forwarded-For when resolving the client IP', async () => {
    // socket (hop 1, trusted) → 3.3.3.3 (hop 2, trusted) → 2.2.2.2 is the client; 1.1.1.1 is spoofable.
    const res = await t
      .http()
      .get('/api/v1/health/live')
      .set('X-Forwarded-For', '1.1.1.1, 2.2.2.2, 3.3.3.3')
      .expect(200);
    expect(res.body.ip).toBe('2.2.2.2');
  });
});
