import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('auth & authorization API', () => {
  it('registers, reads /me, refreshes via cookie and logs out', async () => {
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/v1/auth/register')
      .send({ name: 'Asha', email: 'asha@test.dev', password: 'Password1' })
      .expect(201);
    expect(reg.body.data.user.passwordHash).toBeUndefined();
    const token = reg.body.data.accessToken;

    const me = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.data.role).toBe('USER');

    const refreshed = await agent.post('/api/v1/auth/refresh').expect(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();

    await agent.post('/api/v1/auth/logout').expect(200);
    await agent.post('/api/v1/auth/refresh').expect(401);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'Bo', email: 'bo@test.dev', password: 'short' }).expect(400);
    await request(app).post('/api/v1/auth/register').send({ name: 'Bo', email: 'bo@test.dev', password: 'Password1' }).expect(201);
    const dup = await request(app).post('/api/v1/auth/register').send({ name: 'Bo', email: 'bo@test.dev', password: 'Password1' });
    expect(dup.status).toBe(409);
  });

  it('a normal USER cannot reach organizer or admin APIs, whatever the frontend sends', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Eve', email: 'eve@test.dev', password: 'Password1' });
    const auth = { Authorization: `Bearer ${reg.body.data.accessToken}` };
    await request(app).get('/api/v1/organizer/events').set(auth).expect(403);
    await request(app).get('/api/v1/admin/users').set(auth).expect(403);
    await request(app).get('/api/v1/organizer/events').expect(401);
  });

  it('blocks NoSQL operator injection in login', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });
});
