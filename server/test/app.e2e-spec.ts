import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';

const PASSWORD = 'Correct-Horse-Battery-9';
const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

describe('API foundation (mocked DB/Redis)', () => {
  let app: INestApplication;
  let passwordHash: string;

  const prisma = {
    user: { findFirst: jest.fn(), update: jest.fn() },
    session: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    userRole: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const redis = { ping: jest.fn() };

  const activeUser = () => ({
    id: USER, workspaceId: WS, email: 'admin@example.com', name: 'Admin', passwordHash,
    status: 'ACTIVE', mfaEnabled: false, workspace: { status: 'ACTIVE' },
  });

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD);
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(RedisService).useValue(redis)
      .compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
    prisma.auditLog.create.mockResolvedValue({});
    prisma.session.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
    prisma.userRole.findMany.mockResolvedValue([
      { role: { name: 'Admin', permissions: [{ permission: { code: 'users.read' } }] } },
    ]);
  });

  it('GET /health is public and not wrapped in the envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 503 when a dependency is down', async () => {
    redis.ping.mockRejectedValueOnce(new Error('down'));
    const res = await request(app.getHttpServer()).get('/ready').expect(503);
    expect(res.body.checks).toEqual({ database: true, redis: false });
  });

  it('unauthenticated request -> 401 error envelope with requestId, echoing X-Request-ID', async () => {
    const res = await request(app.getHttpServer()).get('/v1/me').set('X-Request-ID', 'req_abc123').expect(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED', requestId: 'req_abc123' });
    expect(res.headers['x-request-id']).toBe('req_abc123');
  });

  it('generates a request id when none is supplied', async () => {
    const res = await request(app.getHttpServer()).get('/v1/me').expect(401);
    expect(res.body.error.requestId).toMatch(/^req_/);
  });

  it('validation failure -> 400 VALIDATION_ERROR with field details', async () => {
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email: 'nope' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('rejects unknown body properties', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x', workspaceId: WS })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('wrong password -> 401 AUTH_INVALID_CREDENTIALS and a FAILURE audit row', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser());
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login').send({ email: 'admin@example.com', password: 'wrong-password-123' }).expect(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'AUTH_LOGIN_FAILED', result: 'FAILURE' }) }),
    );
  });

  it('unknown email gets the same 401 (no user enumeration)', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login').send({ email: 'ghost@example.com', password: 'whatever-123456' }).expect(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('login -> httpOnly cookie, then /me and permission checks work with it', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser());
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login').send({ email: 'Admin@Example.com', password: PASSWORD }).expect(200);
    expect(login.body.data.permissions).toContain('users.read');
    expect(login.body.meta.requestId).toBeDefined();
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    prisma.session.findUnique.mockResolvedValue({
      id: 's1', userId: USER, workspaceId: WS, lastSeenAt: new Date(), revokedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
      user: { ...activeUser() },
    });
    const me = await request(app.getHttpServer()).get('/v1/me').set('Cookie', cookie.split(';')[0]).expect(200);
    expect(me.body.data).toMatchObject({ email: 'admin@example.com', workspaceId: WS, roles: ['Admin'] });

    // This user lacks audit.read -> 403, not 401
    const audit = await request(app.getHttpServer()).get('/v1/audit-logs').set('Cookie', cookie.split(';')[0]).expect(403);
    expect(audit.body.error.code).toBe('FORBIDDEN');
  });

  it('expired / revoked session -> 401', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1', userId: USER, workspaceId: WS, lastSeenAt: new Date(), revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000), user: activeUser(),
    });
    await request(app.getHttpServer()).get('/v1/me').set('Cookie', 'sid=whatever').expect(401);
  });

  it('cross-origin unsafe request is rejected (CSRF defence)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.co', password: 'x' }).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forgot-password answers identically for unknown emails', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(200);
    expect(res.body.data).toEqual({ accepted: true });
  });
});
