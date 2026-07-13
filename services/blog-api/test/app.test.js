import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildSessionCookie, expandRoles, resolveBuiltInRoles, verifySessionCookie } from '../src/auth.js';
import { config, parseEnvValue } from '../src/config.js';
import { setFirestoreForTests } from '../src/firestore.js';
import { canManageAllPosts, toBlogAuthorView } from '../src/repositories/posts.js';
import {
  buildFullName,
  getPublicAuthorProfileBySlug,
  getUserProfile,
  sanitizeProfile,
  updateUserProfile,
} from '../src/repositories/profiles.js';
import { isAllowedRoleEmail, sanitizeAssignedRoles } from '../src/repositories/users.js';

test('GET /healthz returns service health', async () => {
  const res = await request(createApp()).get('/healthz').expect(200);

  assert.deepEqual(res.body, {
    ok: true,
    service: 'politeia-blog-api',
  });
});

test('GET /v1/me accepts a valid session cookie', async () => {
  const previousDevAuth = config.devAuth;
  config.devAuth = false;
  const session = buildSessionCookie({
    email: 'dev@politeia.ar',
    name: 'Dev Politeia',
    roles: ['admin'],
  });

  try {
    const res = await request(createApp())
      .get('/v1/me')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .expect(200);

    assert.equal(res.body.user.email, 'dev@politeia.ar');
    assert.deepEqual(res.body.user.roles, ['admin', 'reviewer', 'blog']);
    assert.equal(res.body.user.authMode, 'session');
  } finally {
    config.devAuth = previousDevAuth;
  }
});

test('role expansion keeps reviewer as blog plus review and admin as everything', () => {
  assert.deepEqual(expandRoles(['blog']), ['blog']);
  assert.deepEqual(expandRoles(['reviewer']), ['reviewer', 'blog']);
  assert.deepEqual(expandRoles(['admin']), ['admin', 'reviewer', 'blog']);
});

test('built-in admins do not require role assignments', () => {
  assert.deepEqual(resolveBuiltInRoles('dev@politeia.ar'), ['admin']);
  assert.deepEqual(resolveBuiltInRoles('info@politeia.ar'), ['admin']);
  assert.deepEqual(resolveBuiltInRoles('blog@politeia.ar'), []);
});

test('role assignments allow primary-domain and configured external Gmail emails', () => {
  assert.deepEqual(sanitizeAssignedRoles(['ADMIN', 'reviewer', 'blog', 'owner', 'admin']), ['admin', 'reviewer', 'blog']);
  assert.equal(isAllowedRoleEmail('persona@politeia.ar'), true);
  assert.equal(isAllowedRoleEmail('persona@gmail.com'), true);
  assert.equal(isAllowedRoleEmail('persona@example.com'), false);
});

test('user profiles normalize personal fields separately from roles', () => {
  assert.equal(buildFullName('  Juan  ', '  Perez  '), 'Juan Perez');
  assert.deepEqual(sanitizeProfile({
    firstName: '  Juan  ',
    lastName: '  Perez  ',
    description: '  Editor   politico  ',
    photoUrl: 'https://example.com/foto.png',
    publicProfileEnabled: 'true',
  }), {
    firstName: 'Juan',
    lastName: 'Perez',
    description: 'Editor politico',
    photoUrl: 'https://example.com/foto.png',
    publicProfileEnabled: true,
  });
  assert.throws(() => sanitizeProfile({ photoUrl: 'http://example.com/foto.png' }), /photoUrl/);
});

test('user profile public opt-in persists after save and reload', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    const user = { email: 'juan@politeia.ar', name: 'Juan' };
    const saved = await updateUserProfile(user, {
      firstName: 'Juan Cruz',
      lastName: 'Galarza',
      description: 'Autor de relaciones internacionales.',
      publicProfileEnabled: true,
    });

    assert.equal(saved.publicProfileEnabled, true);
    assert.equal(saved.authorSlug, 'juan-cruz-galarza');

    const loaded = await getUserProfile(user);
    assert.equal(loaded.publicProfileEnabled, true);

    const updated = await updateUserProfile(user, {
      description: 'Bio actualizada.',
    });
    assert.equal(updated.publicProfileEnabled, true);

    const publicProfile = await getPublicAuthorProfileBySlug('juan-cruz-galarza');
    assert.equal(publicProfile.fullName, 'Juan Cruz Galarza');
    assert.equal(publicProfile.description, 'Bio actualizada.');
  } finally {
    setFirestoreForTests(null);
  }
});

test('env parser ignores inline comments outside quotes', () => {
  assert.equal(parseEnvValue('admin # admin, reviewer, blog'), 'admin');
  assert.equal(parseEnvValue('"admin # literal"'), 'admin # literal');
  assert.equal(parseEnvValue('reviewer,blog'), 'reviewer,blog');
});

test('dev auth overrides a stale local session while testing roles', async () => {
  const previousDevAuth = config.devAuth;
  const previousNodeEnv = config.nodeEnv;
  const previousEmail = config.devAuthEmail;
  const previousRoles = config.devAuthRoles;
  config.devAuth = true;
  config.nodeEnv = 'development';
  config.devAuthEmail = 'local-admin@politeia.ar';
  config.devAuthRoles = ['admin'];

  const session = buildSessionCookie({
    email: 'stale-blog@politeia.ar',
    name: 'Stale Blog',
    roles: ['blog'],
  });

  try {
    const res = await request(createApp())
      .get('/v1/me')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .expect(200);

    assert.equal(res.body.user.email, 'local-admin@politeia.ar');
    assert.deepEqual(res.body.user.roles, ['admin', 'reviewer', 'blog']);
    assert.equal(res.body.user.authMode, 'dev');
  } finally {
    config.devAuth = previousDevAuth;
    config.nodeEnv = previousNodeEnv;
    config.devAuthEmail = previousEmail;
    config.devAuthRoles = previousRoles;
  }
});

test('post ownership scope is limited for blog and global for reviewer/admin', () => {
  assert.equal(canManageAllPosts({ roles: ['blog'] }), false);
  assert.equal(canManageAllPosts({ roles: ['reviewer', 'blog'] }), true);
  assert.equal(canManageAllPosts({ roles: ['admin', 'reviewer', 'blog'] }), true);
});

test('blog author view does not expose archived status', () => {
  assert.equal(toBlogAuthorView({ status: 'archived' }).status, 'published');
  assert.equal(toBlogAuthorView({ status: 'review' }).status, 'review');
});

test('session cookies reject emails outside the allowed domain', () => {
  const session = buildSessionCookie({
    email: 'person@example.com',
    name: 'External User',
    roles: ['blog'],
  });

  assert.equal(verifySessionCookie(session), null);
});

test('session cookies can carry assigned gmail.com users', () => {
  const session = buildSessionCookie({
    email: 'partner@gmail.com',
    name: 'Gmail Partner',
    roles: ['blog'],
  });

  const user = verifySessionCookie(session);
  assert.equal(user.email, 'partner@gmail.com');
  assert.deepEqual(user.roles, ['blog']);
});

test('POST /v1/auth/google requires a credential', async () => {
  const res = await request(createApp())
    .post('/v1/auth/google')
    .send({})
    .expect(400);

  assert.equal(res.body.error.message, 'credential is required');
});

test('POST /v1/auth/logout clears the session cookie', async () => {
  const res = await request(createApp())
    .post('/v1/auth/logout')
    .expect(200);

  assert.equal(res.body.ok, true);
  assert.match(res.header['set-cookie'][0], new RegExp(`${config.sessionCookieName}=`));
  assert.match(res.header['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
});

test('local admin origins can preflight protected blog routes', async () => {
  const routes = [
    ['/v1/posts/manage', 'GET'],
    ['/v1/categories', 'GET'],
    ['/v1/media', 'POST'],
    ['/v1/import/docx', 'POST'],
  ];

  for (const [path, method] of routes) {
    const res = await request(createApp())
      .options(path)
      .set('Origin', 'http://admin.localhost:3001')
      .set('Access-Control-Request-Method', method)
      .expect(204);

    assert.equal(res.header['access-control-allow-origin'], 'http://admin.localhost:3001');
    assert.equal(res.header['access-control-allow-credentials'], 'true');
  }
});

test('dev auth keeps local admin origins enabled even if NODE_ENV is production', async () => {
  const previousNodeEnv = config.nodeEnv;
  const previousDevAuth = config.devAuth;
  config.nodeEnv = 'production';
  config.devAuth = true;

  try {
    const res = await request(createApp())
      .options('/v1/media')
      .set('Origin', 'http://admin.localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);

    assert.equal(res.header['access-control-allow-origin'], 'http://admin.localhost:3000');
    assert.equal(res.header['access-control-allow-credentials'], 'true');
  } finally {
    config.nodeEnv = previousNodeEnv;
    config.devAuth = previousDevAuth;
  }
});

test('media upload failures still include CORS headers for local admin origin', async () => {
  const res = await request(createApp())
    .post('/v1/media')
    .set('Origin', 'http://admin.localhost:3000');

  assert.ok([400, 503].includes(res.status));
  if (res.status === 400) {
    assert.equal(res.body.error.message, 'file or url is required');
  } else {
    assert.match(res.body.error.message, /credenciales locales/i);
  }
  assert.equal(res.header['access-control-allow-origin'], 'http://admin.localhost:3000');
  assert.equal(res.header['access-control-allow-credentials'], 'true');
});

test('protected cloud routes fail clearly when local ADC is missing', async () => {
  const res = await request(createApp())
    .get('/v1/posts/manage')
    .set('Origin', 'http://admin.localhost:3000');

  if (res.status === 503) {
    assert.match(res.body.error.message, /credenciales locales/i);
    assert.equal(res.header['access-control-allow-origin'], 'http://admin.localhost:3000');
    return;
  }

  assert.equal(res.status, 200);
});

function createMemoryFirestore() {
  const collections = new Map();
  return {
    collection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      return new MemoryCollection(collections.get(name));
    },
  };
}

class MemoryCollection {
  constructor(store) {
    this.store = store;
  }

  doc(id) {
    return new MemoryDoc(this.store, id);
  }

  async add(data) {
    const id = `doc-${this.store.size + 1}`;
    this.store.set(id, resolveMemoryData(data));
    return this.doc(id);
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    const docs = Array.from(this.store.entries())
      .filter(([, data]) => data?.[field] === value)
      .map(([id, data]) => memorySnapshot(id, data));
    return new MemoryQuery(docs);
  }
}

class MemoryDoc {
  constructor(store, id) {
    this.store = store;
    this.id = id;
  }

  async get() {
    return memorySnapshot(this.id, this.store.get(this.id));
  }

  async set(data, options = {}) {
    const current = options.merge ? this.store.get(this.id) || {} : {};
    this.store.set(this.id, {
      ...current,
      ...resolveMemoryData(data),
    });
  }
}

class MemoryQuery {
  constructor(docs) {
    this.docs = docs;
  }

  limit() {
    return this;
  }

  async get() {
    return { docs: this.docs };
  }
}

function memorySnapshot(id, data) {
  return {
    id,
    exists: Boolean(data),
    data: () => data || {},
  };
}

function resolveMemoryData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, resolveMemoryValue(key, value)])
  );
}

function resolveMemoryValue(key, value) {
  if (Array.isArray(value)) return value.map((item) => resolveMemoryValue(key, item));
  if (value && typeof value === 'object') {
    if (key.endsWith('At') && typeof value.toDate !== 'function') return '2026-01-01T00:00:00.000Z';
    return resolveMemoryData(value);
  }
  return value;
}
