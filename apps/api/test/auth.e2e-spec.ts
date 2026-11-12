import {
  PASSWORD,
  addMember,
  auth,
  createTestApp,
  registerOwner,
  resetDatabase,
  type TestApp,
} from './utils';

describe('Auth & sessions (UC-01, UC-02)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(() => t.close());

  const refreshCookieOf = (res: { headers: Record<string, unknown> }) =>
    (res.headers['set-cookie'] as string[])[0].split(';')[0];

  /** Moves the user's revoked tokens 5 minutes into the past, beyond the reuse grace window. */
  const agePresentedTokens = (userId: string) =>
    t.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 5 * 60_000) },
    });

  it('registers a business with a default warehouse and an Owner membership in one go', async () => {
    const owner = await registerOwner(t, 'Alimentation Kira');
    const me = await t.http().get('/api/v1/me').set(auth(owner)).expect(200);
    expect(me.body.business.name).toBe('Alimentation Kira');
    expect(me.body.business.currency).toBe('BIF');
    expect(me.body.role.key).toBe('OWNER');
    expect(me.body.permissions).toHaveLength(29);

    const warehouses = await t.http().get('/api/v1/warehouses').set(auth(owner)).expect(200);
    expect(warehouses.body.data).toHaveLength(1);
    expect(warehouses.body.data[0].isDefault).toBe(true);
    expect(owner.cookie).toMatch(/^sw_refresh=/);
  });

  it('rejects a duplicate email, a common password and invalid input', async () => {
    const owner = await registerOwner(t);
    const base = { fullName: 'Someone', businessName: 'Shop', password: PASSWORD };
    const dup = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ ...base, email: owner.email.toUpperCase() })
      .expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const weak = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ ...base, email: 'weak@example.test', password: 'password123' })
      .expect(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const bad = await t.http().post('/api/v1/auth/register').send({ email: 'nope' }).expect(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['email', 'password', 'fullName', 'businessName']),
    );
  });

  it('rejects wrong credentials with the same error whether or not the email exists, and audits it', async () => {
    const owner = await registerOwner(t);
    const wrong = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'not-the-password' })
      .expect(401);
    const unknown = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'whatever-123' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');

    const failures = await t.prisma.auditLog.count({
      where: { action: 'auth.login_failed', userId: owner.userId },
    });
    expect(failures).toBe(1);
  });

  it('rotates refresh tokens and revokes the whole family when an old one is replayed', async () => {
    const owner = await registerOwner(t);
    const first = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(first.body.accessToken).toBeDefined();
    const rotated = (first.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    expect(rotated).not.toBe(owner.cookie);

    // Replayed after the grace window: an attacker, not a lost response.
    await agePresentedTokens(owner.userId);
    const replay = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', owner.cookie)
      .expect(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate successor is now revoked too.
    await t.http().post('/api/v1/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('accepts a just-rotated token again when the refresh response was lost', async () => {
    const owner = await registerOwner(t);
    // The server rotates, but the browser never receives the new cookie (flaky network)…
    await t.http().post('/api/v1/auth/refresh').set('Cookie', owner.cookie).expect(200);
    // …so it retries with the old one: that must not log the user out.
    const retry = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', owner.cookie)
      .expect(200);
    const next = refreshCookieOf(retry);
    await t.http().post('/api/v1/auth/refresh').set('Cookie', next).expect(200);
  });

  it('keeps both tabs signed in when they refresh with the same cookie at the same time', async () => {
    const owner = await registerOwner(t);
    const results = await Promise.all(
      [1, 2, 3].map(() => t.http().post('/api/v1/auth/refresh').set('Cookie', owner.cookie)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    for (const r of results) {
      await t.http().post('/api/v1/auth/refresh').set('Cookie', refreshCookieOf(r)).expect(200);
    }
  });

  it('gives no grace window to a token revoked by logout', async () => {
    const owner = await registerOwner(t);
    await t.http().post('/api/v1/auth/logout').set('Cookie', owner.cookie).expect(204);
    await t.http().post('/api/v1/auth/refresh').set('Cookie', owner.cookie).expect(401);
  });

  it('logs out by revoking the refresh token', async () => {
    const owner = await registerOwner(t);
    await t.http().post('/api/v1/auth/logout').set('Cookie', owner.cookie).expect(204);
    const after = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', owner.cookie)
      .expect(401);
    expect(after.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('refuses cookie routes from a foreign Origin (CSRF)', async () => {
    const owner = await registerOwner(t);
    const res = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', owner.cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('switches business only to one the user belongs to, with the role of that business', async () => {
    const a = await registerOwner(t, 'Shop A');
    const b = await registerOwner(t, 'Shop B');
    const employeeRole = await t.prisma.role.findFirstOrThrow({
      where: { businessId: null, key: 'EMPLOYEE' },
    });
    await t.prisma.businessMembership.create({
      data: { businessId: b.businessId, userId: a.userId, roleId: employeeRole.id },
    });

    const switched = await t
      .http()
      .post('/api/v1/auth/switch-business')
      .set(auth(a))
      .set('Cookie', a.cookie)
      .send({ businessId: b.businessId })
      .expect(200);
    expect(switched.body.activeBusinessId).toBe(b.businessId);
    const me = await t
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${switched.body.accessToken}`)
      .expect(200);
    expect(me.body.business.name).toBe('Shop B');
    expect(me.body.role.key).toBe('EMPLOYEE');
    expect(me.body.memberships).toHaveLength(2);

    const c = await registerOwner(t, 'Shop C');
    const denied = await t
      .http()
      .post('/api/v1/auth/switch-business')
      .set(auth(a))
      .send({ businessId: c.businessId })
      .expect(404);
    expect(denied.body.error.code).toBe('NOT_FOUND');
  });

  it('applies a suspension on the very next request, without waiting for the token to expire', async () => {
    const owner = await registerOwner(t);
    const employee = await addMember(t, owner.businessId, 'EMPLOYEE');
    await t.http().get('/api/v1/products').set(auth(employee)).expect(200);
    await t.prisma.businessMembership.update({
      where: { businessId_userId: { businessId: owner.businessId, userId: employee.userId } },
      data: { status: 'SUSPENDED' },
    });
    await t.http().get('/api/v1/products').set(auth(employee)).expect(403);
  });

  it('rejects missing, malformed and tampered access tokens', async () => {
    const owner = await registerOwner(t);
    expect((await t.http().get('/api/v1/products').expect(401)).body.error.code).toBe(
      'UNAUTHENTICATED',
    );
    await t.http().get('/api/v1/products').set('Authorization', 'Bearer nonsense').expect(401);
    const [h, p, s] = owner.token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(p, 'base64url').toString()),
        bid: '00000000-0000-4000-8000-000000000000',
      }),
    ).toString('base64url');
    await t
      .http()
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${h}.${forged}.${s}`)
      .expect(401);
  });

  it('changes the password and revokes other sessions', async () => {
    const owner = await registerOwner(t);
    const other = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: PASSWORD })
      .expect(200);
    const otherCookie = (other.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    await t
      .http()
      .post('/api/v1/me/change-password')
      .set(auth(owner))
      .set('Cookie', owner.cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'An0ther-Secret!' })
      .expect(204);

    await t.http().post('/api/v1/auth/refresh').set('Cookie', otherCookie).expect(401);
    await t.http().post('/api/v1/auth/refresh').set('Cookie', owner.cookie).expect(200);
    await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'An0ther-Secret!' })
      .expect(200);
  });
});
