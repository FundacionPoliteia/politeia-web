import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildSessionCookie, expandRoles, resolveBuiltInRoles, verifySessionCookie } from '../src/auth.js';
import { config, parseEnvValue } from '../src/config.js';
import { setFirestoreForTests } from '../src/firestore.js';
import { canManageAllPosts, matchesManageStatus, toBlogAuthorView } from '../src/repositories/posts.js';
import {
  listInAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyCommentCreated,
  notifyCommentReplied,
  notifyCommentStatusChanged,
  notifyPostEditEnabled,
  notifyPostEditRequested,
  notifyPostPublished,
  notifyPostSubmittedForReview,
} from '../src/repositories/notifications.js';
import {
  buildFullName,
  createManagedAuthorProfile,
  deleteManagedAuthorProfile,
  getPublicAuthorProfileBySlug,
  getUserProfile,
  listPublicAuthorProfiles,
  sanitizeProfile,
  updateManagedAuthorProfile,
  updateUserProfile,
} from '../src/repositories/profiles.js';
import { updatePostCommentStatus } from '../src/repositories/comments.js';
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
    focusArea: '  Seguridad   internacional  ',
    closingPhrase: '  Una   mirada propia.  ',
    photoUrl: 'https://example.com/foto.png',
    publicProfileEnabled: 'true',
  }), {
    firstName: 'Juan',
    lastName: 'Perez',
    description: 'Editor politico',
    focusArea: 'Seguridad internacional',
    closingPhrase: 'Una mirada propia.',
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
    await firestore.collection('posts').doc('post-1').set({
      authorName: 'Juan Cruz Galarza',
      title: 'Nota de prueba',
    });

    const saved = await updateUserProfile(user, {
      firstName: 'Juan Cruz',
      lastName: 'Galarza',
      description: 'Autor de relaciones internacionales.',
      focusArea: 'Relaciones internacionales y seguridad.',
      closingPhrase: 'Una mirada desde relaciones internacionales.',
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
    assert.equal(publicProfile.focusArea, 'Relaciones internacionales y seguridad.');
    assert.equal(publicProfile.closingPhrase, 'Una mirada desde relaciones internacionales.');
  } finally {
    setFirestoreForTests(null);
  }
});

test('public author profiles list published author cards with stats', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await firestore.collection('posts').doc('post-1').set({
      authorName: 'Juan Cruz Galarza',
      title: 'Nota publicada',
      slug: 'nota-publicada',
      category: 'Relaciones Internacionales',
      status: 'published',
      publishedAt: '2026-07-14T10:00:00.000Z',
    });
    await firestore.collection('posts').doc('post-2').set({
      authorName: 'Juan Cruz Galarza',
      title: 'Nota archivada',
      slug: 'nota-archivada',
      category: 'Archivo',
      status: 'archived',
      publishedAt: '2026-07-15T10:00:00.000Z',
    });

    await updateUserProfile({ email: 'juan@politeia.ar', name: 'Juan' }, {
      firstName: 'Juan Cruz',
      lastName: 'Galarza',
      description: 'Autor de relaciones internacionales.',
      focusArea: 'Relaciones internacionales y seguridad.',
      publicProfileEnabled: true,
    });

    const result = await listPublicAuthorProfiles();
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].fullName, 'Juan Cruz Galarza');
    assert.equal(result.items[0].focusArea, 'Relaciones internacionales y seguridad.');
    assert.equal(result.items[0].postCount, 1);
    assert.equal(result.items[0].latestPostTitle, 'Nota publicada');
    assert.deepEqual(result.items[0].categories, ['Relaciones Internacionales']);
  } finally {
    setFirestoreForTests(null);
  }
});

test('admin managed author profiles can be created and deleted', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await firestore.collection('posts').doc('post-1').set({
      authorName: 'Autora Invitada',
      title: 'Nota invitada',
    });

    const created = await createManagedAuthorProfile({
      firstName: 'Autora',
      lastName: 'Invitada',
      description: 'Perfil creado por admin.',
      publicProfileEnabled: true,
    }, 'dev@politeia.ar');

    assert.equal(created.id, 'managed-author-autora-invitada');
    assert.equal(created.managedAuthor, true);
    assert.equal(created.publicProfileEnabled, true);

    const deleted = await deleteManagedAuthorProfile(created.id, 'dev@politeia.ar');
    assert.equal(deleted.id, created.id);
    assert.equal(deleted.managedAuthor, true);

    const publicProfile = await getPublicAuthorProfileBySlug('autora-invitada');
    assert.equal(publicProfile, null);
  } finally {
    setFirestoreForTests(null);
  }
});

test('admin managed author profiles can be edited', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await firestore.collection('posts').doc('post-1').set({
      authorName: 'Autora Editada',
      title: 'Nota editada',
    });

    const created = await createManagedAuthorProfile({
      firstName: 'Autora',
      lastName: 'Invitada',
      description: 'Perfil creado por admin.',
      publicProfileEnabled: false,
    }, 'dev@politeia.ar');

    const updated = await updateManagedAuthorProfile(created.id, {
      firstName: 'Autora',
      lastName: 'Editada',
      description: 'Perfil actualizado.',
      focusArea: 'Instituciones y cultura politica.',
      closingPhrase: 'Cierre administrado.',
      photoUrl: 'https://example.com/autora.png',
      publicProfileEnabled: true,
    }, 'dev@politeia.ar');

    assert.equal(updated.id, created.id);
    assert.equal(updated.fullName, 'Autora Editada');
    assert.equal(updated.authorSlug, 'autora-editada');
    assert.equal(updated.description, 'Perfil actualizado.');
    assert.equal(updated.focusArea, 'Instituciones y cultura politica.');
    assert.equal(updated.closingPhrase, 'Cierre administrado.');
    assert.equal(updated.photoUrl, 'https://example.com/autora.png');
    assert.equal(updated.managedAuthor, true);
    assert.equal(updated.publicProfileEnabled, true);

    const publicProfile = await getPublicAuthorProfileBySlug('autora-editada');
    assert.equal(publicProfile.fullName, 'Autora Editada');
    assert.equal(publicProfile.focusArea, 'Instituciones y cultura politica.');
    assert.equal(publicProfile.closingPhrase, 'Cierre administrado.');
  } finally {
    setFirestoreForTests(null);
  }
});

test('POST /v1/posts stores author note', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const session = buildSessionCookie({
    email: 'dev@politeia.ar',
    name: 'Dev Politeia',
    roles: ['admin'],
  });

  try {
    const res = await request(createApp())
      .post('/v1/posts')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({
        title: 'Nota con cierre',
        contentMarkdown: 'Contenido de prueba',
        authorName: 'Dev Politeia',
        authorNote: '  Cierre   breve del autor.  ',
        showAuthorNote: true,
        tags: [],
      })
      .expect(201);

    assert.equal(res.body.item.authorNote, 'Cierre breve del autor.');
    assert.equal(res.body.item.showAuthorNote, true);
  } finally {
    setFirestoreForTests(null);
  }
});

test('in-app notifications target roles and emails independently from email opt-in', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    const post = {
      id: 'post-1',
      title: 'Nota en revision',
      authorEmail: 'autor@politeia.ar',
      authorName: 'Autor Politeia',
    };
    const reviewer = { email: 'reviewer@politeia.ar', name: 'Reviewer', roles: ['reviewer', 'blog'] };
    const author = { email: 'autor@politeia.ar', name: 'Autor', roles: ['blog'] };
    const admin = { email: 'admin@politeia.ar', name: 'Admin', roles: ['admin', 'reviewer', 'blog'] };

    await notifyPostSubmittedForReview(post, author);
    let reviewerInbox = await listInAppNotifications(reviewer);
    let authorInbox = await listInAppNotifications(author);
    assert.equal(reviewerInbox.items.length, 1);
    assert.equal(reviewerInbox.items[0].type, 'post.submittedReview');
    assert.equal(authorInbox.items.length, 0);

    const comment = {
      id: 'comment-1',
      authorEmail: reviewer.email,
      authorName: reviewer.name,
      body: 'Revisar fuente.',
      selectedText: 'texto seleccionado',
    };
    await notifyCommentCreated(post, comment, reviewer);
    authorInbox = await listInAppNotifications(author);
    assert.equal(authorInbox.items.some((item) => item.type === 'comment.created'), true);

    await notifyCommentStatusChanged(post, comment, author, 'resolved');
    reviewerInbox = await listInAppNotifications(reviewer);
    const adminInbox = await listInAppNotifications(admin);
    assert.equal(reviewerInbox.items.some((item) => item.type === 'comment.resolved'), true);
    assert.equal(adminInbox.items.some((item) => item.type === 'comment.resolved'), true);

    await notifyCommentReplied(post, {
      ...comment,
      replies: [{ id: 'reply-1', body: 'Lo reviso y actualizo.', authorEmail: author.email, authorName: author.name }],
    }, author);
    reviewerInbox = await listInAppNotifications(reviewer);
    assert.equal(reviewerInbox.items.some((item) => item.type === 'comment.reply'), true);

    await notifyPostPublished(post, reviewer);
    authorInbox = await listInAppNotifications(author);
    assert.equal(authorInbox.items.some((item) => item.type === 'post.published'), true);

    await notifyPostEditRequested(post, author);
    reviewerInbox = await listInAppNotifications(reviewer);
    assert.equal(reviewerInbox.items.some((item) => item.type === 'post.editRequested'), true);

    await notifyPostEditEnabled(post, reviewer);
    authorInbox = await listInAppNotifications(author);
    assert.equal(authorInbox.items.some((item) => item.type === 'post.editEnabled'), true);
    const adminEditInbox = await listInAppNotifications(admin);
    assert.equal(adminEditInbox.items.some((item) => item.type === 'post.editEnabled'), true);

    const unreadBefore = authorInbox.unreadCount;
    const first = authorInbox.items[0];
    const readItem = await markNotificationRead(first.id, author);
    assert.equal(Boolean(readItem.readAt), true);
    authorInbox = await listInAppNotifications(author);
    assert.equal(authorInbox.unreadCount, unreadBefore - 1);

    const allRead = await markAllNotificationsRead(author);
    assert.equal(allRead.unreadCount, 0);
  } finally {
    setFirestoreForTests(null);
  }
});

test('resolved comments can receive follow-up replies', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await firestore.collection('posts').doc('post-1').set({
      title: 'Nota publicada',
      authorEmail: 'autor@politeia.ar',
      authorName: 'Autor Politeia',
      status: 'published',
      contentMarkdown: 'Contenido con comentario resuelto.',
    });
    await firestore.collection('userProfiles').doc('autor@politeia.ar').set({
      email: 'autor@politeia.ar',
      firstName: 'Autor',
      lastName: 'Politeia',
      photoUrl: 'https://example.com/autor.png',
    });
    await firestore.collection('userProfiles').doc('reviewer@politeia.ar').set({
      email: 'reviewer@politeia.ar',
      firstName: 'Revisor',
      lastName: 'Politeia',
      photoUrl: 'https://example.com/revisor.png',
    });
    await firestore.collection('reviewComments').doc('comment-1').set({
      postId: 'post-1',
      body: 'Aclarar esta idea.',
      selectedText: 'idea original',
      selectedTextCurrent: 'idea actualizada',
      status: 'resolved',
      authorEmail: 'reviewer@politeia.ar',
      authorName: 'Reviewer',
      replies: [{
        id: 'reply-previa',
        body: 'Ya lo resolvi.',
        action: 'resolved',
        selectedText: 'idea actualizada',
        authorEmail: 'autor@politeia.ar',
        authorName: 'Autor',
        createdAt: '2026-07-13T00:00:00.000Z',
      }],
    });

    const result = await updatePostCommentStatus('post-1', 'comment-1', {
      replyBody: 'Agrego mas detalle sobre la resolucion.',
      selectedTextCurrent: 'idea actualizada final',
    }, {
      email: 'autor@politeia.ar',
      name: 'Autor',
      roles: ['blog'],
    });

    assert.equal(result.comment.status, 'resolved');
    assert.equal(result.comment.replies.length, 2);
    assert.equal(result.comment.replies[1].body, 'Agrego mas detalle sobre la resolucion.');
    assert.equal(result.comment.replies[1].action, 'reply');
    assert.equal(result.comment.replies[1].selectedText, 'idea actualizada final');
    assert.equal(result.comment.replies[1].authorPhotoUrl, 'https://example.com/autor.png');
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
  assert.equal(toBlogAuthorView({ status: 'published-edition' }).status, 'published-edition');
  assert.equal(toBlogAuthorView({ status: 'review' }).status, 'review');
});

test('published edition stays visible in published and review management filters', () => {
  assert.equal(matchesManageStatus({ status: 'published-edition' }, 'published', true), true);
  assert.equal(matchesManageStatus({ status: 'published-edition' }, 'review', true), false);
  assert.equal(matchesManageStatus({ status: 'published-edition', editionSubmittedAt: '2026-07-16T00:00:00Z' }, 'review', true), true);
  assert.equal(matchesManageStatus({ status: 'published-edition' }, 'published', false), true);
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
    async runTransaction(fn) {
      const transaction = {
        get(ref) {
          return ref.get();
        },
        set(ref, data, options) {
          return ref.set(data, options);
        },
        update(ref, data) {
          return ref.update(data);
        },
      };
      return fn(transaction);
    },
  };
}

class MemoryCollection {
  constructor(store) {
    this.store = store;
  }

  doc(id = '') {
    return new MemoryDoc(this.store, id || `doc-${this.store.size + 1}`);
  }

  async add(data) {
    const id = `doc-${this.store.size + 1}`;
    this.store.set(id, resolveMemoryData(data));
    return this.doc(id);
  }

  async get() {
    const docs = Array.from(this.store.entries()).map(([id, data]) => memorySnapshot(id, data));
    return { docs, empty: docs.length === 0 };
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    const docs = Array.from(this.store.entries())
      .filter(([, data]) => data?.[field] === value)
      .map(([id, data]) => memorySnapshot(id, data));
    return new MemoryQuery(docs);
  }

  orderBy(field, direction = 'asc') {
    const multiplier = direction === 'desc' ? -1 : 1;
    const docs = Array.from(this.store.entries())
      .map(([id, data]) => memorySnapshot(id, data))
      .sort((a, b) => String(a.data()?.[field] || '').localeCompare(String(b.data()?.[field] || '')) * multiplier);
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

  async update(data) {
    const current = this.store.get(this.id) || {};
    this.store.set(this.id, {
      ...current,
      ...resolveMemoryData(data),
    });
  }

  async delete() {
    this.store.delete(this.id);
  }
}

class MemoryQuery {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
  }

  limit(count) {
    return new MemoryQuery(this.docs.slice(0, count));
  }

  async get() {
    return { docs: this.docs, empty: this.docs.length === 0 };
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
    if (key.endsWith('At') && typeof value.toDate !== 'function') return new Date().toISOString();
    return resolveMemoryData(value);
  }
  return value;
}
