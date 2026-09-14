import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { config } from './config.js';
import { buildSession } from './auth.js';
import { createMemoryStore, setStoreForTests } from './store.js';
import type { Role } from '@politeia/quorum-contracts';

const original = { devAuth: config.devAuth, publicAccessRequired: config.publicAccessRequired, env: process.env.DEV_AUTH };
const member = { fullName: 'Ana Equipo', role: 'Coordinación editorial', organization: 'Fundación Politeia', area: 'Quórum', bio: 'Presentación pública.', photoUrl: '', order: 1 };
beforeEach(() => { config.devAuth = true; process.env.DEV_AUTH = 'true'; config.publicAccessRequired = false; setStoreForTests(createMemoryStore(false)); });
afterEach(() => { config.devAuth = original.devAuth; config.publicAccessRequired = original.publicAccessRequired; if (original.env === undefined) delete process.env.DEV_AUTH; else process.env.DEV_AUTH = original.env; });
describe('perfiles propios de Quórum', () => {
  it('guarda, vuelve a leer, publica y conserva la versión pública durante la edición', async () => {
    const app = createApp();
    const created = (await request(app).post('/v1/manage/team').send(member).expect(201)).body.item;
    const path = `/v1/manage/team/${created.id}`;
    expect((await request(createApp()).get('/v1/manage/team').expect(200)).body.items[0]).toEqual(created);
    expect((await request(app).get('/v1/public/team').expect(200)).body.items).toEqual([]);
    const published = (await request(app).post(path + '/publish').send({ version: 1 }).expect(200)).body.item;
    const changed = { ...member, fullName: 'Ana Corregida', bio: 'Borrador todavía privado', photoUrl: 'https://example.com/photo.png' };
    const saved = (await request(app).put(path).send({ version: published.version, draft: changed }).expect(200)).body.item;
    expect(saved.draft).toEqual(changed);
    const visible = (await request(createApp()).get('/v1/public/team').expect(200));
    expect(visible.headers['cache-control']).toBe('no-store');
    expect(visible.body.items).toEqual([{ ...member, id: created.id }]);
    expect(JSON.stringify(visible.body)).not.toContain('updatedBy');
    await request(app).post(path + '/publish').send({ version: saved.version }).expect(200);
    expect((await request(app).get('/v1/public/team')).body.items[0].fullName).toBe('Ana Corregida');
    await request(app).post(path + '/unpublish').send({ version: saved.version + 1 }).expect(200);
    expect((await request(app).get('/v1/public/team')).body.items).toEqual([]);
    expect((await request(app).get('/v1/manage/team')).body.items[0].draft).toEqual(changed);
  });
  it('rechaza guardados y publicaciones de una versión obsoleta sin sobrescribir', async () => {
    const app = createApp();
    const item = (await request(app).post('/v1/manage/team').send(member)).body.item;
    const path = `/v1/manage/team/${item.id}`;
    const attempts = await Promise.all(['Uno', 'Dos'].map(fullName => request(app).put(path).send({ version: 1, draft: { ...member, fullName } })));
    expect(attempts.map(r => r.status).sort()).toEqual([200, 409]);
    await request(app).post(path + '/publish').send({ version: 1 }).expect(409);
    expect((await request(app).get('/v1/public/team')).body.items).toEqual([]);
    expect((await request(app).get('/v1/manage/team')).body.items[0].version).toBe(2);
  });
  it('no permite acceso editorial ni anónimo a ninguna operación administrativa', async () => {
    config.devAuth = false; process.env.DEV_AUTH = 'false';
    const app = createApp();
    const cookie = (roles: Role[]) => `${config.sessionCookieName}=${buildSession({ email: 'editor@example.com', name: 'Editor', picture: '', roles, csrfToken: 'test-csrf' })}`;
    for (const [method, path] of [['get', '/v1/manage/team'], ['post', '/v1/manage/team'], ['put', '/v1/manage/team/missing'], ['post', '/v1/manage/team/missing/publish'], ['post', '/v1/manage/team/missing/unpublish']] as const) {
      await request(app)[method](path).send({}).expect(401);
      await request(app)[method](path).set('Cookie', cookie(['quorum_editor'])).set('x-csrf-token', 'test-csrf').send({}).expect(403);
    }
    await request(app).post('/v1/manage/team').set('Cookie', cookie(['quorum_admin'])).send(member).expect(403);
    await request(app).post('/v1/manage/team').set('Cookie', cookie(['quorum_admin'])).set('x-csrf-token', 'test-csrf').send(member).expect(201);
  });
  it('rechaza datos inválidos y no incluye perfiles ajenos a Quórum', async () => {
    const app = createApp();
    await request(app).post('/v1/manage/team').send({ ...member, fullName: '' }).expect(422);
    await request(app).post('/v1/manage/team').send({ ...member, photoUrl: 'javascript:alert(1)' }).expect(422);
    await request(app).post('/v1/manage/team').send({ ...member, project: 'blog' }).expect(422);
    await request(app).put('/v1/manage/team/missing').send({ draft: member, version: 1 }).expect(404);
  });
});
