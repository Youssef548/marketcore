import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MemberRoles } from '@app/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  login,
  newTenant,
  organizationPayload,
  registerAndLogin,
  tenantHeaders,
  unique,
} from './support/fixtures';

describe('organizations (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an organization and makes the creator its owner', async () => {
    const accessToken = await registerAndLogin(app, `${unique('owner')}@marketcore.test`);
    const slug = unique('owned');

    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(organizationPayload('owned', { name: 'Owned Co', slug }))
      .expect(201);

    expect(res.body).toMatchObject({ name: 'Owned Co', slug, role: MemberRoles.OWNER });
  });

  it('refuses a duplicate slug with CONFLICT', async () => {
    const accessToken = await registerAndLogin(app, `${unique('dup-org')}@marketcore.test`);
    const slug = unique('dup-org');
    const payload = { name: 'Dup Co', slug };

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('lists only the organizations the caller belongs to', async () => {
    const owner = await newTenant(app, 'lister');
    const stranger = await registerAndLogin(app, `${unique('stranger')}@marketcore.test`);

    const own = await request(app.getHttpServer())
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const strangerList = await request(app.getHttpServer())
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${stranger}`)
      .expect(200);

    expect(own.body.map((organization: { id: string }) => organization.id)).toContain(
      owner.organizationId,
    );
    expect(strangerList.body).toEqual([]);
  });

  it('lets a member read the member list', async () => {
    const tenant = await newTenant(app, 'members');

    const res = await request(app.getHttpServer())
      .get('/api/v1/organizations/members')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ role: MemberRoles.OWNER });
  });

  it('refuses a member adding another member with FORBIDDEN', async () => {
    const owner = await newTenant(app, 'forbid');
    const memberEmail = `${unique('member')}@marketcore.test`;
    await registerAndLogin(app, memberEmail);

    await request(app.getHttpServer())
      .post('/api/v1/organizations/members')
      .set(tenantHeaders(owner.accessToken, owner.organizationId))
      .send({ email: memberEmail })
      .expect(204);

    const memberToken = await login(app, memberEmail);

    const res = await request(app.getHttpServer())
      .post('/api/v1/organizations/members')
      .set(tenantHeaders(memberToken, owner.organizationId))
      .send({ email: `${unique('third')}@marketcore.test` })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses removing the last owner', async () => {
    const tenant = await newTenant(app, 'lastowner');
    const members = await request(app.getHttpServer())
      .get('/api/v1/organizations/members')
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(200);
    const ownerId = members.body[0].userId as string;

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/organizations/members/${ownerId}`)
      .set(tenantHeaders(tenant.accessToken, tenant.organizationId))
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });
});
