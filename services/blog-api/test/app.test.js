import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildSessionCookie, expandRoles, resolveBuiltInRoles, verifySessionCookie } from '../src/auth.js';
import { config, parseEnvValue } from '../src/config.js';
import { setFirestoreForTests } from '../src/firestore.js';
import { canManageAllPosts, matchesManageStatus, toBlogAuthorView } from '../src/repositories/posts.js';
import {
  cleanupExpiredNotifications,
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
import {
  confirmNewsletterSubscription,
  createNewsletterCampaign,
  createNewsletterTemplate,
  createNewsletterUnsubscribeUrl,
  deleteNewsletterTemplate,
  getNewsletterOverview,
  listNewsletterSubscribers,
  listNewsletterTemplates,
  requestNewsletterSubscription,
  sendNewsletterTest,
  unsubscribeNewsletter,
} from '../src/repositories/newsletter.js';
import { MAIL_CHANNELS, sendMail, syncResendContact } from '../src/mail/provider.js';
import { processResendWebhook } from '../src/repositories/mailWebhooks.js';
import {
  listApiRequestLogs,
  listMailOperationLogs,
  recordApiRequest,
  sendAdminResendTest,
} from '../src/repositories/operations.js';

test('GET /healthz returns service health', async () => {
  const res = await request(createApp()).get('/healthz').expect(200);

  assert.deepEqual(res.body, {
    ok: true,
    service: 'politeia-blog-api',
    version: '1.0.0',
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
    assert.deepEqual(res.body.user.roles, ['admin', 'reviewer', 'blog', 'newsletter']);
    assert.equal(res.body.user.authMode, 'session');
  } finally {
    config.devAuth = previousDevAuth;
  }
});

test('role expansion keeps reviewer as blog plus review and admin as everything', () => {
  assert.deepEqual(expandRoles(['blog']), ['blog']);
  assert.deepEqual(expandRoles(['reviewer']), ['reviewer', 'blog']);
  assert.deepEqual(expandRoles(['newsletter']), ['newsletter']);
  assert.deepEqual(expandRoles(['admin']), ['admin', 'reviewer', 'blog', 'newsletter']);
});

test('built-in admins do not require role assignments', () => {
  assert.deepEqual(resolveBuiltInRoles('dev@politeia.ar'), ['admin']);
  assert.deepEqual(resolveBuiltInRoles('info@politeia.ar'), ['admin']);
  assert.deepEqual(resolveBuiltInRoles('blog@politeia.ar'), []);
});

test('role assignments allow primary-domain and configured external Gmail emails', () => {
  assert.deepEqual(sanitizeAssignedRoles(['ADMIN', 'reviewer', 'blog', 'newsletter', 'owner', 'admin']), ['admin', 'reviewer', 'blog', 'newsletter']);
  assert.equal(isAllowedRoleEmail('persona@politeia.ar'), true);
  assert.equal(isAllowedRoleEmail('persona@gmail.com'), true);
  assert.equal(isAllowedRoleEmail('persona@example.com'), false);
});

test('newsletter administration accepts newsletter and admin roles only', async () => {
  const firestore = createMemoryFirestore();
  const previousDevAuth = config.devAuth;
  setFirestoreForTests(firestore);
  config.devAuth = false;

  const sessionFor = (email, roles) => `${config.sessionCookieName}=${encodeURIComponent(buildSessionCookie({ email, name: email, roles }))}`;
  const app = createApp();

  try {
    await request(app)
      .get('/v1/newsletter/admin/overview')
      .set('Cookie', sessionFor('newsletter@politeia.ar', ['newsletter']))
      .expect(200);

    const subscribers = await request(app)
      .get('/v1/newsletter/admin/subscribers?status=subscribed')
      .set('Cookie', sessionFor('newsletter@politeia.ar', ['newsletter']))
      .expect(200);
    assert.deepEqual(subscribers.body, { status: 'subscribed', total: 0, items: [] });

    const mediaResponse = await request(app)
      .post('/v1/media')
      .set('Cookie', sessionFor('newsletter@politeia.ar', ['newsletter']))
      .expect(400);
    assert.equal(mediaResponse.body.error.message, 'file or url is required');

    await request(app)
      .get('/v1/newsletter/admin/overview')
      .set('Cookie', sessionFor('admin@politeia.ar', ['admin']))
      .expect(200);

    await request(app)
      .get('/v1/newsletter/admin/overview')
      .set('Cookie', sessionFor('reviewer@politeia.ar', ['reviewer']))
      .expect(403);

    await request(app)
      .get('/v1/newsletter/admin/subscribers?status=pending')
      .set('Cookie', sessionFor('reviewer@politeia.ar', ['reviewer']))
      .expect(403);

    await request(app)
      .get('/v1/newsletter/admin/overview')
      .set('Cookie', sessionFor('blog@politeia.ar', ['blog']))
      .expect(403);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
});

test('operational logs are restricted to admin users', async () => {
  const firestore = createMemoryFirestore();
  const previousDevAuth = config.devAuth;
  setFirestoreForTests(firestore);
  config.devAuth = false;
  const sessionFor = (email, roles) => `${config.sessionCookieName}=${encodeURIComponent(buildSessionCookie({ email, name: email, roles }))}`;
  const app = createApp();

  try {
    await request(app)
      .get('/v1/admin/logs/requests')
      .set('Cookie', sessionFor('admin@politeia.ar', ['admin']))
      .expect(200);

    await request(app)
      .get('/v1/admin/logs/mail')
      .set('Cookie', sessionFor('reviewer@politeia.ar', ['reviewer']))
      .expect(403);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
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

test('managed author public opt-in activates when a matching post appears and respects opt-out', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    const created = await createManagedAuthorProfile({
      firstName: 'Autora',
      lastName: 'Pendiente',
      description: 'Perfil listo antes de su primera nota.',
      publicProfileEnabled: true,
    }, 'dev@politeia.ar');

    assert.equal(created.publicProfileEnabled, true);
    assert.equal(created.canSharePublicProfile, false);
    assert.equal(await getPublicAuthorProfileBySlug('autora-pendiente'), null);

    await firestore.collection('posts').doc('post-pendiente').set({
      authorName: 'Autora Pendiente',
      title: 'Primera nota',
      status: 'published',
      publishedAt: '2026-07-17T12:00:00.000Z',
    });

    const activated = await getPublicAuthorProfileBySlug('autora-pendiente');
    assert.equal(activated.fullName, 'Autora Pendiente');

    const disabled = await updateManagedAuthorProfile(created.id, {
      publicProfileEnabled: false,
    }, 'dev@politeia.ar');
    assert.equal(disabled.publicProfileEnabled, false);
    assert.equal(await getPublicAuthorProfileBySlug('autora-pendiente'), null);
  } finally {
    setFirestoreForTests(null);
  }
});

test('legacy managed profiles recover the default opt-in until an admin explicitly disables it', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await firestore.collection('userProfiles').doc('managed-author-autora-legada').set({
      firstName: 'Autora',
      lastName: 'Legada',
      fullName: 'Autora Legada',
      authorSlug: 'autora-legada',
      managedAuthor: true,
      publicProfileEnabled: false,
    });
    await firestore.collection('posts').doc('post-legado').set({
      authorName: 'Autora Legada',
      title: 'Nota legada',
      status: 'published',
      publishedAt: '2026-07-17T12:00:00.000Z',
    });

    const recovered = await getPublicAuthorProfileBySlug('autora-legada');
    assert.equal(recovered.fullName, 'Autora Legada');

    const disabled = await updateManagedAuthorProfile('managed-author-autora-legada', {
      publicProfileEnabled: false,
    }, 'dev@politeia.ar');
    assert.equal(disabled.publicProfileEnabled, false);
    assert.equal(await getPublicAuthorProfileBySlug('autora-legada'), null);
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
    assert.equal(reviewerInbox.recentDays, 3);
    assert.equal(reviewerInbox.retentionDays, 7);
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

test('notification retention removes events and read receipts older than seven days', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const now = Date.parse('2026-07-18T12:00:00.000Z');
  const user = { email: 'autor@politeia.ar', name: 'Autor', roles: ['blog'] };

  try {
    await firestore.collection('notificationEvents').doc('expired-event').set({
      type: 'comment.created',
      actorEmail: 'reviewer@politeia.ar',
      targetEmails: [user.email],
      createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await firestore.collection('notificationEvents').doc('retained-event').set({
      type: 'comment.created',
      actorEmail: 'reviewer@politeia.ar',
      targetEmails: [user.email],
      createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await firestore.collection('notificationReads').doc('expired-read').set({
      eventId: 'expired-event',
      userEmail: user.email,
      readAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await firestore.collection('notificationReads').doc('retained-read').set({
      eventId: 'retained-event',
      userEmail: user.email,
      readAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const cleanup = await cleanupExpiredNotifications({ force: true, now });
    assert.deepEqual(cleanup, { deletedEvents: 1, deletedReads: 1, skipped: false });
    assert.equal((await firestore.collection('notificationEvents').doc('expired-event').get()).exists, false);
    assert.equal((await firestore.collection('notificationEvents').doc('retained-event').get()).exists, true);
    assert.equal((await firestore.collection('notificationReads').doc('expired-read').get()).exists, false);
    assert.equal((await firestore.collection('notificationReads').doc('retained-read').get()).exists, true);

    const inbox = await listInAppNotifications(user);
    assert.deepEqual(inbox.items.map((item) => item.id), ['retained-event']);
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
    assert.deepEqual(res.body.user.roles, ['admin', 'reviewer', 'blog', 'newsletter']);
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

test('newsletter subscription uses double opt-in and becomes active only after confirmation', async () => {
  const firestore = createMemoryFirestore();
  const previous = {
    mailProvider: config.mailProvider,
    newsletterTokenSecret: config.newsletterTokenSecret,
    apiPublicUrl: config.apiPublicUrl,
  };
  setFirestoreForTests(firestore);
  config.mailProvider = 'console';
  config.newsletterTokenSecret = 'test-newsletter-secret-with-enough-entropy';
  config.apiPublicUrl = 'http://localhost:8080';

  try {
    const requested = await requestNewsletterSubscription({ email: 'Reader@Example.com', source: 'test' });
    assert.equal(requested.accepted, true);

    const pending = await getNewsletterOverview();
    assert.equal(pending.counts.pending, 1);
    assert.equal(pending.counts.subscribed, 0);

    const pendingSubscribers = await listNewsletterSubscribers({ status: 'pending' });
    assert.equal(pendingSubscribers.total, 1);
    assert.equal(pendingSubscribers.items[0].email, 'reader@example.com');
    assert.equal(pendingSubscribers.items[0].source, 'test');

    const deliveries = await firestore.collection('emailDeliveries').get();
    assert.equal(deliveries.docs.length, 1);
    const delivery = deliveries.docs[0].data();
    assert.equal(delivery.status, 'logged');
    assert.equal(delivery.channel, 'newsletter');
    const tokenMatch = delivery.html.match(/\/v1\/newsletter\/confirm\?token=([^"<]+)/);
    assert.ok(tokenMatch);

    const confirmed = await confirmNewsletterSubscription(decodeURIComponent(tokenMatch[1]));
    assert.equal(confirmed.email, 'reader@example.com');
    assert.equal(confirmed.status, 'subscribed');

    const active = await getNewsletterOverview();
    assert.equal(active.counts.pending, 0);
    assert.equal(active.counts.subscribed, 1);

    const activeSubscribers = await listNewsletterSubscribers({ status: 'subscribed' });
    assert.equal(activeSubscribers.total, 1);
    assert.equal(activeSubscribers.items[0].email, 'reader@example.com');
    assert.ok(activeSubscribers.items[0].confirmedAt);

    await assert.rejects(
      () => listNewsletterSubscribers({ status: 'unsubscribed' }),
      /status must be subscribed or pending/,
    );

    await requestNewsletterSubscription({ email: 'reader@example.com', source: 'repeat' });
    const repeatedDeliveries = await firestore.collection('emailDeliveries').get();
    assert.equal(repeatedDeliveries.docs.length, 1);

    const unsubscribeUrl = new URL(createNewsletterUnsubscribeUrl('reader@example.com'));
    const unsubscribed = await unsubscribeNewsletter(unsubscribeUrl.searchParams.get('token'));
    assert.equal(unsubscribed.status, 'unsubscribed');
    const inactive = await getNewsletterOverview();
    assert.equal(inactive.counts.subscribed, 0);
    assert.equal(inactive.counts.unsubscribed, 1);
  } finally {
    Object.assign(config, previous);
    setFirestoreForTests(null);
  }
});

test('newsletter campaigns are project-scoped and remain drafts in console mode', async () => {
  const firestore = createMemoryFirestore();
  const previousProvider = config.mailProvider;
  setFirestoreForTests(firestore);
  config.mailProvider = 'console';

  try {
    const item = await createNewsletterCampaign({
      name: 'Resumen semanal',
      subject: 'Novedades de Politeia',
      previewText: 'Las notas de esta semana',
      content: '## Una nota nueva\n\n**Gracias** por leer.\n\n![Portada](https://example.com/portada.jpg)\n\n| Tema | Estado |\n| --- | --- |\n| Newsletter | Listo |',
      send: false,
    }, 'admin@politeia.ar');
    assert.equal(item.projectKey, config.mailProjectKey);
    assert.equal(item.status, 'draft');
    assert.match(item.contentHtml, /<h2>Una nota nueva<\/h2>/);
    assert.match(item.contentHtml, /<strong>Gracias<\/strong>/);
    assert.match(item.contentHtml, /<img[^>]+src="https:\/\/example\.com\/portada\.jpg"/);
    assert.match(item.contentHtml, /<table[^>]*>/);
  } finally {
    config.mailProvider = previousProvider;
    setFirestoreForTests(null);
  }
});

test('newsletter templates provide bases and persist reusable custom drafts', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    const initial = await listNewsletterTemplates();
    assert.equal(initial.items.length, 3);
    assert.deepEqual(initial.items.map((item) => item.name), [
      'Resumen semanal',
      'Nueva nota',
      'Actualizacion de proyecto',
    ]);
    assert.ok(initial.items.every((item) => item.builtIn));

    const custom = await createNewsletterTemplate({
      name: 'Edicion mensual',
      campaignName: 'Resumen de julio',
      subject: 'Julio en Politeia',
      previewText: 'Las lecturas y proyectos del mes.',
      content: '<h2>Balance del mes</h2><script>alert(1)</script><p>Contenido reutilizable.</p>',
    }, 'admin@politeia.ar');
    assert.equal(custom.name, 'Edicion mensual');
    assert.equal(custom.builtIn, false);
    assert.doesNotMatch(custom.content, /script/i);

    const saved = await listNewsletterTemplates();
    assert.equal(saved.items.length, 4);
    assert.equal(saved.items.find((item) => item.id === custom.id)?.subject, 'Julio en Politeia');

    await assert.rejects(
      () => deleteNewsletterTemplate('base-weekly-summary'),
      /plantilla base no se puede eliminar/i,
    );
    await deleteNewsletterTemplate(custom.id);
    assert.equal((await listNewsletterTemplates()).items.length, 3);
  } finally {
    setFirestoreForTests(null);
  }
});

test('newsletter test emails include a signed unsubscribe link', async () => {
  const firestore = createMemoryFirestore();
  const previous = {
    mailProvider: config.mailProvider,
    newsletterTokenSecret: config.newsletterTokenSecret,
    apiPublicUrl: config.apiPublicUrl,
  };
  setFirestoreForTests(firestore);
  config.mailProvider = 'console';
  config.newsletterTokenSecret = 'test-newsletter-secret-with-enough-entropy';
  config.apiPublicUrl = 'https://api.example.com';

  try {
    await sendNewsletterTest({
      to: 'reader@example.com',
      subject: 'Prueba de novedades',
      previewText: 'Una mirada breve antes de abrir el correo',
      content: '<p>Contenido editorial.</p>',
      actorEmail: 'admin@politeia.ar',
    });
    const snapshot = await firestore.collection('emailDeliveries').get();
    assert.equal(snapshot.docs.length, 1);
    const delivery = snapshot.docs[0].data();
    assert.match(delivery.html, /Una mirada breve antes de abrir el correo/);
    assert.match(delivery.html, /href="https:\/\/api\.example\.com\/v1\/newsletter\/unsubscribe\?token=/);
    assert.match(delivery.html, />darte de baja<\/a>/);
    assert.match(delivery.text, /Darte de baja: https:\/\/api\.example\.com\/v1\/newsletter\/unsubscribe\?token=/);
  } finally {
    Object.assign(config, previous);
    setFirestoreForTests(null);
  }
});

test('Resend broadcasts receive the provider unsubscribe placeholder as a clickable link', async () => {
  const firestore = createMemoryFirestore();
  const previous = {
    mailProvider: config.mailProvider,
    resendApiKey: config.resendApiKey,
    resendSegmentId: config.resendSegmentId,
  };
  const previousFetch = global.fetch;
  let requestBody;
  setFirestoreForTests(firestore);
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  config.resendSegmentId = 'segment-1';
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ id: 'broadcast-1' }) };
  };

  try {
    await createNewsletterCampaign({
      name: 'Resumen semanal',
      subject: 'Novedades de Politeia',
      content: '<p>Contenido editorial.</p>',
      send: false,
    }, 'admin@politeia.ar');
    assert.match(requestBody.html, /href="\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}"/);
    assert.match(requestBody.html, />darte de baja<\/a>/);
    assert.match(requestBody.text, /Darte de baja: \{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
  } finally {
    Object.assign(config, previous);
    global.fetch = previousFetch;
    setFirestoreForTests(null);
  }
});

test('api request logs retain operational metadata without query values', async () => {
  const firestore = createMemoryFirestore();
  const previousEnabled = config.apiRequestLogsEnabled;
  setFirestoreForTests(firestore);
  config.apiRequestLogsEnabled = true;

  try {
    await recordApiRequest({
      requestId: 'request-1',
      method: 'get',
      path: '/v1/newsletter/confirm?token=private-token&source=blog',
      queryKeys: ['token', 'source'],
      status: 303,
      durationMs: 12.6,
      actorEmail: 'Admin@Politeia.ar',
      origin: 'https://admin.politeia.ar',
      errorMessage: 'Provider rejected re_secret_should_not_leak',
    });

    const result = await listApiRequestLogs({ limit: 20 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].path, '/v1/newsletter/confirm');
    assert.deepEqual(result.items[0].queryKeys, ['token', 'source']);
    assert.equal(result.items[0].actorEmail, 'admin@politeia.ar');
    assert.equal(result.items[0].originHost, 'admin.politeia.ar');
    assert.doesNotMatch(result.items[0].errorMessage, /re_secret/);
    assert.match(result.items[0].errorMessage, /redacted-resend-key/);
  } finally {
    config.apiRequestLogsEnabled = previousEnabled;
    setFirestoreForTests(null);
  }
});

test('admin Resend test targets the authenticated admin and appears in mail logs', async () => {
  const firestore = createMemoryFirestore();
  const previous = {
    mailProvider: config.mailProvider,
    resendApiKey: config.resendApiKey,
  };
  const previousFetch = global.fetch;
  setFirestoreForTests(firestore);
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'resend-test-1' }) });

  try {
    const item = await sendAdminResendTest({ email: 'admin@politeia.ar', name: 'Admin' }, 'request-test-1');
    assert.equal(item.recipientEmail, 'admin@politeia.ar');
    assert.equal(item.status, 'sent');
    assert.equal(item.providerMessageId, 'resend-test-1');

    const logs = await listMailOperationLogs({ limit: 20 });
    assert.equal(logs.items.length, 1);
    assert.equal(logs.items[0].type, 'admin.resend.test');
    assert.equal(Object.hasOwn(logs.items[0], 'html'), false);
    assert.equal(Object.hasOwn(logs.items[0], 'text'), false);
  } finally {
    Object.assign(config, previous);
    global.fetch = previousFetch;
    setFirestoreForTests(null);
  }
});

test('resend provider uses channel sender and idempotency header', async () => {
  const previous = {
    mailProvider: config.mailProvider,
    resendApiKey: config.resendApiKey,
    mailFromUpdates: config.mailFromUpdates,
  };
  const previousFetch = global.fetch;
  let requestOptions;
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  config.mailFromUpdates = 'Politeia Updates <updates@politeia.ar>';
  global.fetch = async (_url, options) => {
    requestOptions = options;
    return { ok: true, json: async () => ({ id: 'email-1' }) };
  };

  try {
    const result = await sendMail({
      channel: MAIL_CHANNELS.updates,
      to: 'reader@example.com',
      subject: 'Actualizacion',
      text: 'Contenido',
      idempotencyKey: 'updates/post-1',
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerMessageId, 'email-1');
    assert.equal(requestOptions.headers['Idempotency-Key'], 'updates/post-1');
    assert.equal(JSON.parse(requestOptions.body).from, 'Politeia Updates <updates@politeia.ar>');
  } finally {
    Object.assign(config, previous);
    global.fetch = previousFetch;
  }
});

test('resend contact sync creates a contact without undeclared custom properties', async () => {
  const previous = {
    mailProvider: config.mailProvider,
    resendApiKey: config.resendApiKey,
    resendSegmentId: config.resendSegmentId,
    resendTopicId: config.resendTopicId,
  };
  const previousFetch = global.fetch;
  let requestBody;
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  config.resendSegmentId = 'segment-1';
  config.resendTopicId = 'topic-1';
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: 'contact-1' }) };
  };

  try {
    const result = await syncResendContact({ email: 'reader@example.com', subscribed: true });
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(requestBody, 'properties'), false);
    assert.deepEqual(requestBody.segments, [{ id: 'segment-1' }]);
    assert.deepEqual(requestBody.topics, [{ id: 'topic-1', subscription: 'opt_in' }]);
  } finally {
    Object.assign(config, previous);
    global.fetch = previousFetch;
  }
});

test('resend contact sync updates existing contact topic through its dedicated endpoint', async () => {
  const previous = {
    mailProvider: config.mailProvider,
    resendApiKey: config.resendApiKey,
    resendSegmentId: config.resendSegmentId,
    resendTopicId: config.resendTopicId,
  };
  const previousFetch = global.fetch;
  const requests = [];
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  config.resendSegmentId = 'segment-1';
  config.resendTopicId = 'topic-1';
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return { ok: false, status: 409, json: async () => ({ message: 'Contact already exists' }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: 'contact-1' }) };
  };

  try {
    const result = await syncResendContact({ email: 'reader@example.com', subscribed: true });
    assert.equal(result.ok, true);
    assert.equal(requests[1].url, 'https://api.resend.com/contacts/reader%40example.com');
    assert.equal(requests[2].url, 'https://api.resend.com/contacts/reader%40example.com/segments/segment-1');
    assert.equal(requests[3].url, 'https://api.resend.com/contacts/reader%40example.com/topics');
    assert.deepEqual(JSON.parse(requests[3].options.body), [{ id: 'topic-1', subscription: 'opt_in' }]);
  } finally {
    Object.assign(config, previous);
    global.fetch = previousFetch;
  }
});

test('resend webhooks are idempotent and suppress bounced newsletter recipients', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  await firestore.collection('newsletterSubscriptions').doc('subscriber-1').set({
    projectKey: config.mailProjectKey,
    audienceKey: config.newsletterAudienceKey,
    email: 'reader@example.com',
    status: 'subscribed',
  });
  await firestore.collection('emailDeliveries').doc('delivery-1').set({
    providerMessageId: 'email-1',
    status: 'sent',
  });

  try {
    const event = {
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'email-1',
        to: ['reader@example.com'],
        subject: 'Newsletter',
        bounce: { message: 'Mailbox unavailable' },
      },
    };
    const first = await processResendWebhook('msg-1', event);
    const repeated = await processResendWebhook('msg-1', event);
    assert.equal(first.duplicate, false);
    assert.equal(repeated.duplicate, true);
    assert.equal((await firestore.collection('newsletterSubscriptions').doc('subscriber-1').get()).data().status, 'suppressed');
    assert.equal((await firestore.collection('emailDeliveries').doc('delivery-1').get()).data().status, 'bounced');

    await processResendWebhook('msg-2', {
      type: 'contact.updated',
      created_at: new Date().toISOString(),
      data: {
        id: 'contact-1',
        email: 'reader@example.com',
        unsubscribed: true,
      },
    });
    const unsubscribed = (await firestore.collection('newsletterSubscriptions').doc('subscriber-1').get()).data();
    assert.equal(unsubscribed.status, 'unsubscribed');
    assert.equal(unsubscribed.providerContactId, 'contact-1');
  } finally {
    setFirestoreForTests(null);
  }
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
