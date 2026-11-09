import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { SystemRoleKey } from '@stockwise/shared';
import * as argon2 from 'argon2';
import request from 'supertest';
import { seedSystemRoles } from '../prisma/seed-system';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  setupApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Empties every table (TRUNCATE bypasses the append-only triggers), then re-seeds roles. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await seedSystemRoles(prisma);
}

export const PASSWORD = 'Correct-Horse-9';

export interface Actor {
  token: string;
  userId: string;
  businessId: string;
  email: string;
  cookie: string;
}

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${++counter}@example.test`;

/** Registers a new business through the API and returns its owner. */
export async function registerOwner(t: TestApp, businessName = 'Test Shop'): Promise<Actor> {
  const email = uniqueEmail('owner');
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .send({ fullName: 'Owner Person', email, password: PASSWORD, businessName })
    .expect(201);
  return {
    token: res.body.accessToken,
    userId: res.body.user.id,
    businessId: res.body.activeBusinessId,
    email,
    cookie: refreshCookie(res),
  };
}

/** Adds a member with a system role directly in the DB (invitations come later), then logs in. */
export async function addMember(
  t: TestApp,
  businessId: string,
  role: SystemRoleKey,
): Promise<Actor> {
  const email = uniqueEmail(role.toLowerCase());
  const roleRow = await t.prisma.role.findFirstOrThrow({ where: { businessId: null, key: role } });
  const user = await t.prisma.user.create({
    data: {
      email,
      fullName: `${role} Person`,
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    },
  });
  await t.prisma.businessMembership.create({
    data: { businessId, userId: user.id, roleId: roleRow.id },
  });
  const res = await t
    .http()
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    token: res.body.accessToken,
    userId: user.id,
    businessId,
    email,
    cookie: refreshCookie(res),
  };
}

export function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('sw_refresh='));
  return cookie ? cookie.split(';')[0] : '';
}

export const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

export async function createProduct(
  t: TestApp,
  actor: Actor,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; sku: string }> {
  const res = await t
    .http()
    .post('/api/v1/products')
    .set(auth(actor))
    .send({ name: `Product ${++counter}`, sellingPrice: '1000', ...overrides });
  if (res.status !== 201) throw new Error(`createProduct failed: ${JSON.stringify(res.body)}`);
  return res.body;
}
