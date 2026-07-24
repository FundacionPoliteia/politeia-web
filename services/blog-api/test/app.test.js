import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { buildSessionCookie, expandRoles, resolveBuiltInRoles, verifySessionCookie } from '../src/auth.js';
import { config, parseEnvValue } from '../src/config.js';
import { setFirestoreForTests } from '../src/firestore.js';
import { canManageAllPosts, matchesManageStatus, toBlogAuthorView } from '../src/repositories/posts.js';
import {
  cleanupExpiredNotifications,
  getNotificationPreferences,
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
  updateNotificationPreferences,
} from '../src/repositories/notifications.js';
import {
  buildFullName,
  createManagedAuthorProfile,
  deleteManagedAuthorProfile,
  getPublicAuthorProfileBySlug,
  getUserProfile,
  listPublicAuthorProfiles,
  sanitizeProfile,
  updateAuthorProfileAsAdmin,
  updateManagedAuthorProfile,
  updateUserProfile,
  identityNameKey,
} from '../src/repositories/profiles.js';
import { updatePostCommentStatus } from '../src/repositories/comments.js';
import { isAllowedRoleEmail, resolveAssignedRoles, sanitizeAssignedRoles } from '../src/repositories/users.js';
import {
  approveProfileClaim,
  blockProfileClaim,
  createProfileClaim,
  getProfileClaimMatch,
  listMyProfileClaims,
  releaseProfileClaim,
} from '../src/repositories/profileClaims.js';
import {
  confirmNewsletterSubscription,
  createNewsletterCampaign,
  createNewsletterTemplate,
  createNewsletterUnsubscribeUrl,
  deleteNewsletterTemplate,
  getNewsletterOverview,
  getNewsletterPreferences,
  listNewsletterSubscribers,
  listNewsletterTemplates,
  renderNewsletterPreview,
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
import {
  dispatchMailing,
  getMailingAdminOverview,
  queuePublishedPostMail,
  renderMailingPreview,
  updateMailingSettings,
} from '../src/repositories/mailingAutomation.js';
import { createMailThumbnail, inspectUploadedImage } from '../src/repositories/media.js';
import {
  buildExcerpt,
  normalizeExcerptMode,
  sanitizeReferences,
} from '../src/utils/content.js';
import {
  getUserUiPreferences,
  sanitizeUiPreferences,
  updateUserUiPreferences,
} from '../src/repositories/uiPreferences.js';

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

test('post content helpers preserve manual mode and sanitize references', () => {
  assert.equal(normalizeExcerptMode(undefined, { hasExcerpt: true }), 'manual');
  assert.equal(normalizeExcerptMode(undefined, { hasExcerpt: false }), 'auto');
  assert.equal(normalizeExcerptMode('auto', { hasExcerpt: true }), 'auto');
  assert.deepEqual(sanitizeReferences([
    { text: '  Informe   anual ', url: ' https://example.com/informe ' },
    { text: 'Fuente sin enlace', url: '' },
    { text: '   ', url: 'https://example.com/vacia' },
  ]), [
    { text: 'Informe anual', url: 'https://example.com/informe' },
    { text: 'Fuente sin enlace' },
  ]);
});

test('automatic excerpts strip formatting and cut at a word boundary', () => {
  const excerpt = buildExcerpt('## Titulo\n\nUn texto **largo** con palabras completas para el resumen.', '', 30);
  assert.equal(excerpt, 'Titulo Un texto largo con...');

  const structuredExcerpt = buildExcerpt(
    '[Texto enlazado](https://example.com) <table><tr><td>Dato tabular</td></tr></table> Cierre visible.'
  );
  assert.equal(structuredExcerpt, 'Texto enlazado Cierre visible.');
});

test('uploaded image inspection accepts modern web formats and rejects unsafe content', async () => {
  const formats = [
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
    ['avif', 'image/avif', 'avif'],
    ['gif', 'image/gif', 'gif'],
  ];

  for (const [format, mimetype, extension] of formats) {
    const buffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 20, g: 110, b: 145, alpha: 1 },
      },
    })[format]().toBuffer();
    const inspected = await inspectUploadedImage({ buffer, mimetype, size: buffer.length });
    assert.equal(inspected.contentType, mimetype);
    assert.equal(inspected.extension, extension);
  }

  const jpeg = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  }).jpeg().toBuffer();

  await assert.rejects(
    () => inspectUploadedImage({ buffer: jpeg, mimetype: 'image/png', size: jpeg.length }),
    /does not match its file type/
  );
  await assert.rejects(
    () => inspectUploadedImage({
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'),
      mimetype: 'image/svg+xml',
    }),
    /JPEG, PNG, WebP, AVIF, or GIF/
  );
  await assert.rejects(
    () => inspectUploadedImage({ buffer: Buffer.from('not-an-image'), mimetype: 'image/png' }),
    /invalid or corrupted/
  );
});

test('UI preferences sanitize fields and preserve partial updates per user', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    assert.deepEqual(sanitizeUiPreferences({
      lastPanelTab: 'unknown',
      sections: {
        adminUsersOpen: true,
        previewCardOpen: 'yes',
        injectedSetting: true,
      },
      privateData: 'ignored',
    }), {
      version: 2,
      lastPanelTab: '',
      sections: {
        adminUsersOpen: true,
        adminManagerOpen: false,
        notificationPreferencesOpen: false,
        adminProfileClaimsOpen: false,
        adminProfileEditorOpen: true,
        previewCardOpen: true,
        advancedOptionsOpen: false,
        mobilePostsOpen: false,
      },
      help: {
        completedGuides: {},
        dismissedHints: [],
      },
    });

    await updateUserUiPreferences('first@politeia.ar', {
      lastPanelTab: 'profiles',
      sections: {
        adminUsersOpen: true,
        advancedOptionsOpen: true,
      },
      help: {
        completedGuides: { blogs: 1, injected: 99 },
        dismissedHints: ['editor-tip', '../invalid'],
      },
    });
    await updateUserUiPreferences('first@politeia.ar', {
      sections: { previewCardOpen: false },
    });

    const first = await getUserUiPreferences('first@politeia.ar');
    const second = await getUserUiPreferences('second@politeia.ar');
    assert.equal(first.lastPanelTab, 'profiles');
    assert.equal(first.sections.adminUsersOpen, true);
    assert.equal(first.sections.advancedOptionsOpen, true);
    assert.equal(first.sections.previewCardOpen, false);
    assert.deepEqual(first.help, {
      completedGuides: { blogs: 1 },
      dismissedHints: ['editor-tip'],
    });
    assert.equal(second.lastPanelTab, '');
    assert.deepEqual(second.sections, {
      adminUsersOpen: false,
      adminManagerOpen: false,
      notificationPreferencesOpen: false,
      adminProfileClaimsOpen: false,
      adminProfileEditorOpen: true,
      previewCardOpen: true,
      advancedOptionsOpen: false,
      mobilePostsOpen: false,
    });
    assert.deepEqual(second.help, { completedGuides: {}, dismissedHints: [] });
  } finally {
    setFirestoreForTests(null);
  }
});

test('UI preference endpoints require a session and isolate account state', async () => {
  const firestore = createMemoryFirestore();
  const previousDevAuth = config.devAuth;
  setFirestoreForTests(firestore);
  config.devAuth = false;
  const sessionFor = (email) => `${config.sessionCookieName}=${encodeURIComponent(buildSessionCookie({ email, name: email, roles: ['admin'] }))}`;

  try {
    const app = createApp();
    await request(app).get('/v1/ui-preferences').expect(401);
    await request(app)
      .patch('/v1/ui-preferences')
      .set('Cookie', sessionFor('dev@politeia.ar'))
      .send({ lastPanelTab: 'mailing', sections: { adminManagerOpen: true } })
      .expect(200);

    const first = await request(app)
      .get('/v1/ui-preferences')
      .set('Cookie', sessionFor('dev@politeia.ar'))
      .expect(200);
    const second = await request(app)
      .get('/v1/ui-preferences')
      .set('Cookie', sessionFor('info@politeia.ar'))
      .expect(200);

    assert.equal(first.body.item.lastPanelTab, 'mailing');
    assert.equal(first.body.item.sections.adminManagerOpen, true);
    assert.equal(second.body.item.lastPanelTab, '');
    assert.equal(second.body.item.sections.adminManagerOpen, false);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
});

test('GET /v1/me replaces stale primary-domain session roles with the current assignment', async () => {
  const firestore = createMemoryFirestore();
  const previousDevAuth = config.devAuth;
  setFirestoreForTests(firestore);
  config.devAuth = false;
  await firestore.collection('users').doc('member@politeia.ar').set({
    email: 'member@politeia.ar',
    roles: ['blog'],
    active: true,
  });
  const session = buildSessionCookie({
    email: 'member@politeia.ar',
    name: 'Member',
    roles: ['admin'],
    directoryRoles: [],
  });

  try {
    const app = createApp();
    const current = await request(app)
      .get('/v1/me')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .expect(200);
    assert.deepEqual(current.body.user.roles, ['blog']);

    await firestore.collection('users').doc('member@politeia.ar').update({
      roles: [],
      active: false,
    });
    const revoked = await request(app)
      .get('/v1/me')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .expect(200);
    assert.deepEqual(revoked.body.user.roles, []);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
});

test('GET /v1/me rejects an external session after its role assignment is removed', async () => {
  const firestore = createMemoryFirestore();
  const previousDevAuth = config.devAuth;
  setFirestoreForTests(firestore);
  config.devAuth = false;
  await firestore.collection('users').doc('member@gmail.com').set({
    email: 'member@gmail.com',
    roles: ['blog'],
    active: true,
  });
  const session = buildSessionCookie({
    email: 'member@gmail.com',
    name: 'External member',
    roles: ['admin'],
    directoryRoles: [],
  });

  try {
    const app = createApp();
    const current = await request(app)
      .get('/v1/me')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .expect(200);
    assert.deepEqual(current.body.user.roles, ['blog']);

    await firestore.collection('users').doc('member@gmail.com').update({
      roles: [],
      active: false,
    });
    await request(app)
      .get('/v1/me')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .expect(401);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
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
  assert.deepEqual(sanitizeAssignedRoles(['ADMIN', 'reviewer', 'blog', 'newsletter', 'owner', 'admin']), ['admin']);
  assert.deepEqual(sanitizeAssignedRoles(['reviewer', 'blog', 'newsletter']), ['reviewer', 'blog', 'newsletter']);
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

test('mailing configuration is admin-only while reviewers can read publication policy', async () => {
  const firestore = createMemoryFirestore();
  const previousDevAuth = config.devAuth;
  setFirestoreForTests(firestore);
  config.devAuth = false;
  const sessionFor = (email, roles) => `${config.sessionCookieName}=${encodeURIComponent(buildSessionCookie({ email, name: email, roles }))}`;

  try {
    const app = createApp();
    await request(app)
      .get('/v1/mailing/publication-policy')
      .set('Cookie', sessionFor('reviewer@politeia.ar', ['reviewer']))
      .expect(200);
    await request(app)
      .get('/v1/mailing/admin/overview')
      .set('Cookie', sessionFor('reviewer@politeia.ar', ['reviewer']))
      .expect(403);
    await request(app)
      .get('/v1/mailing/admin/overview')
      .set('Cookie', sessionFor('admin@politeia.ar', ['admin']))
      .expect(200);
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

test('reviewer can preserve a historical publication date when publishing a migrated post', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const previousDevAuth = config.devAuth;
  config.devAuth = false;
  const session = buildSessionCookie({
    email: 'reviewer@politeia.ar',
    name: 'Reviewer Politeia',
    roles: ['reviewer'],
  });

  try {
    const created = await request(createApp())
      .post('/v1/posts')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({
        title: 'Nota historica',
        contentMarkdown: 'Contenido migrado',
        authorName: 'Autora Historica',
        publicationDate: '2020-05-15',
        tags: [],
      })
      .expect(201);

    assert.equal(created.body.item.publicationDate, '2020-05-15');

    const published = await request(createApp())
      .post(`/v1/posts/${created.body.item.id}/publish`)
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({ notifySubscribers: false })
      .expect(200);

    assert.equal(published.body.item.publishedAt._seconds, Date.parse('2020-05-15T12:00:00.000Z') / 1000);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
});

test('legacy manual excerpts stay unchanged while automatic excerpts follow content updates', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const previousDevAuth = config.devAuth;
  config.devAuth = false;
  const session = buildSessionCookie({
    email: 'reviewer@politeia.ar',
    name: 'Reviewer Politeia',
    roles: ['reviewer'],
  });
  const posts = firestore.collection('posts');

  try {
    await posts.doc('legacy-excerpt').set({
      title: 'Nota anterior',
      slug: 'nota-anterior',
      contentMarkdown: 'Contenido original',
      contentHtml: '<p>Contenido original</p>',
      excerpt: 'Extracto manual conservado.',
      authorEmail: 'reviewer@politeia.ar',
      authorName: 'Reviewer Politeia',
      status: 'draft',
      deletedAt: null,
    });

    const manual = await request(createApp())
      .patch('/v1/posts/legacy-excerpt')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({ contentMarkdown: 'Contenido nuevo que no debe reemplazar el extracto manual.' })
      .expect(200);

    assert.equal(manual.body.item.excerpt, 'Extracto manual conservado.');

    await posts.doc('legacy-excerpt').update({ excerptMode: 'auto' });
    const automatic = await request(createApp())
      .patch('/v1/posts/legacy-excerpt')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({ contentMarkdown: 'Contenido automatico actualizado para la card.' })
      .expect(200);

    assert.equal(automatic.body.item.excerptMode, 'auto');
    assert.equal(automatic.body.item.excerpt, 'Contenido automatico actualizado para la card.');
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
});

test('published edition keeps the frozen excerpt, references and empty cover until republished', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const previousDevAuth = config.devAuth;
  config.devAuth = false;
  const session = buildSessionCookie({
    email: 'reviewer@politeia.ar',
    name: 'Reviewer Politeia',
    roles: ['reviewer'],
  });

  try {
    const created = await request(createApp())
      .post('/v1/posts')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({
        title: 'Nota con version publica',
        contentMarkdown: 'Contenido publico original.',
        excerptMode: 'manual',
        excerpt: 'Extracto publico original.',
        authorName: 'Reviewer Politeia',
        tags: ['Prueba'],
        references: [{ text: 'Fuente original', url: 'https://example.com/original' }],
      })
      .expect(201);

    await request(createApp())
      .post(`/v1/posts/${created.body.item.id}/publish`)
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({ notifySubscribers: false })
      .expect(200);

    await request(createApp())
      .post(`/v1/posts/${created.body.item.id}/enable-edit`)
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({})
      .expect(200);

    await request(createApp())
      .patch(`/v1/posts/${created.body.item.id}`)
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({
        contentMarkdown: 'Contenido nuevo todavia no publicado.',
        excerptMode: 'manual',
        excerpt: 'Extracto nuevo todavia no publicado.',
        coverImage: 'https://example.com/nueva-portada.webp',
        references: [{ text: 'Fuente nueva', url: 'https://example.com/nueva' }],
      })
      .expect(200);

    const publicPost = await request(createApp())
      .get(`/v1/posts/${created.body.item.slug}`)
      .expect(200);

    assert.equal(publicPost.body.item.excerpt, 'Extracto publico original.');
    assert.equal(publicPost.body.item.coverImage, null);
    assert.deepEqual(publicPost.body.item.references, [
      { text: 'Fuente original', url: 'https://example.com/original' },
    ]);
  } finally {
    config.devAuth = previousDevAuth;
    setFirestoreForTests(null);
  }
});

test('blog role cannot choose a historical publication date', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const previousDevAuth = config.devAuth;
  config.devAuth = false;
  const session = buildSessionCookie({
    email: 'author@politeia.ar',
    name: 'Autor Politeia',
    roles: ['blog'],
  });

  try {
    const res = await request(createApp())
      .post('/v1/posts')
      .set('Cookie', `${config.sessionCookieName}=${encodeURIComponent(session)}`)
      .send({
        title: 'Nota sin permiso de fecha',
        contentMarkdown: 'Contenido',
        publicationDate: '2020-05-15',
        tags: [],
      })
      .expect(403);

    assert.match(res.body.error.message, /publicationDate/);
  } finally {
    config.devAuth = previousDevAuth;
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
      slug: 'nota-en-revision',
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
    assert.equal(authorInbox.items.find((item) => item.type === 'post.published')?.postSlug, 'nota-en-revision');

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

test('public author detail resolves legacy profiles without a stored author slug', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await firestore.collection('userProfiles').doc('legacy-author').set({
      firstName: 'Lourdes Ariadna',
      lastName: 'Ramos',
      description: 'Perfil publico legado.',
      focusArea: 'Politica nacional',
      managedAuthor: true,
      publicProfileEnabled: true,
    });
    await firestore.collection('posts').doc('legacy-author-post').set({
      authorName: 'Lourdes Ariadna Ramos',
      title: 'Nota publica',
      status: 'published',
      publishedAt: '2026-07-21T12:00:00.000Z',
    });

    const profile = await getPublicAuthorProfileBySlug('lourdes-ariadna-ramos');
    assert.equal(profile.fullName, 'Lourdes Ariadna Ramos');
    assert.equal(profile.description, 'Perfil publico legado.');
    assert.equal(profile.focusArea, 'Politica nacional');
  } finally {
    setFirestoreForTests(null);
  }
});

test('email notification preferences start disabled with every event unchecked', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const user = { email: 'autor@politeia.ar', name: 'Autor', roles: ['blog'] };

  try {
    const initial = await getNotificationPreferences(user);
    assert.equal(initial.enabled, false);
    assert.equal(initial.events.roleChanged, false);
    assert.equal(Object.values(initial.events).every((enabled) => enabled === false), true);

    const updated = await updateNotificationPreferences(user, {
      enabled: true,
      events: { postPublished: true },
    });
    assert.equal(updated.enabled, true);
    assert.equal(updated.events.postPublished, true);
    assert.equal(updated.events.roleChanged, false);
    assert.equal(updated.events.commentCreated, false);
  } finally {
    setFirestoreForTests(null);
  }
});

test('admin can correct a user profile without changing account identity', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await updateUserProfile({ email: 'autora@politeia.ar', name: 'Autora' }, {
      firstName: 'Autroa',
      lastName: 'Registrada',
      description: 'Texto con un error.',
      publicProfileEnabled: false,
    });

    const updated = await updateAuthorProfileAsAdmin('autora@politeia.ar', {
      firstName: 'Autora',
      lastName: 'Registrada',
      description: 'Texto corregido por un administrador.',
      focusArea: 'Instituciones y ciudadania.',
      publicProfileEnabled: true,
    }, 'dev@politeia.ar');

    assert.equal(updated.email, 'autora@politeia.ar');
    assert.equal(updated.managedAuthor, false);
    assert.equal(updated.fullName, 'Autora Registrada');
    assert.equal(updated.authorSlug, 'autora-registrada');
    assert.equal(updated.description, 'Texto corregido por un administrador.');
    assert.equal(updated.focusArea, 'Instituciones y ciudadania.');
    assert.equal(updated.publicProfileEnabled, true);

    const stored = await firestore.collection('userProfiles').doc('autora@politeia.ar').get();
    assert.equal(stored.data().email, 'autora@politeia.ar');
    assert.equal(stored.data().managedAuthor, false);
    assert.equal(stored.data().updatedBy, 'dev@politeia.ar');
  } finally {
    setFirestoreForTests(null);
  }
});

test('notification retention removes events and read receipts older than seven days', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const now = Date.now();
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
    assert.deepEqual(confirmed.topics, { newsletter: true, newPosts: true });

    const active = await getNewsletterOverview();
    assert.equal(active.counts.pending, 0);
    assert.equal(active.counts.subscribed, 1);

    const activeSubscribers = await listNewsletterSubscribers({ status: 'subscribed' });
    assert.equal(activeSubscribers.total, 1);
    assert.equal(activeSubscribers.items[0].email, 'reader@example.com');
    assert.ok(activeSubscribers.items[0].confirmedAt);
    assert.deepEqual(activeSubscribers.items[0].topics, { newsletter: true, newPosts: true });

    await assert.rejects(
      () => listNewsletterSubscribers({ status: 'unsubscribed' }),
      /status must be subscribed or pending/,
    );

    await requestNewsletterSubscription({ email: 'reader@example.com', source: 'repeat' });
    const repeatedDeliveries = await firestore.collection('emailDeliveries').get();
    assert.equal(repeatedDeliveries.docs.length, 1);

    const unsubscribeUrl = new URL(createNewsletterUnsubscribeUrl('reader@example.com'));
    const preferencesFromUnsubscribe = await getNewsletterPreferences(unsubscribeUrl.searchParams.get('token'));
    assert.deepEqual(preferencesFromUnsubscribe.topics, { newsletter: true, newPosts: true });
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
    assert.match(item.contentHtml, /<h2[^>]*>Una nota nueva<\/h2>/);
    assert.match(item.contentHtml, /<strong>Gracias<\/strong>/);
    assert.match(item.contentHtml, /<img[^>]+src="https:\/\/example\.com\/portada\.jpg"/);
    assert.match(item.contentHtml, /<table[^>]*>/);
  } finally {
    config.mailProvider = previousProvider;
    setFirestoreForTests(null);
  }
});

test('post mailing respects the weekly cap and the configurable 12 hour dispatch cycle', async () => {
  const firestore = createMemoryFirestore();
  const previousProvider = config.mailProvider;
  setFirestoreForTests(firestore);
  config.mailProvider = 'console';

  try {
    await updateMailingSettings({
      enabled: true,
      automaticByDefault: true,
      weeklyLimit: 2,
      dispatchIntervalHours: 12,
      gracePeriodMinutes: 0,
      timeZone: 'UTC',
      singlePreheader: 'Una nota para leer hoy.',
      digestPreheader: 'Las notas nuevas de esta semana.',
    }, 'admin@politeia.ar');
    await firestore.collection('newsletterSubscriptions').doc('reader').set({
      projectKey: config.mailProjectKey,
      email: 'reader@example.com',
      status: 'subscribed',
      topics: { newsletter: true, newPosts: true },
    });

    for (let index = 1; index <= 3; index += 1) {
      const post = {
        id: `post-${index}`,
        title: `Nota ${index}`,
        slug: `nota-${index}`,
        excerpt: `Extracto ${index}`,
        status: 'published',
        publishedAt: new Date(Date.now() + index).toISOString(),
      };
      await firestore.collection('posts').doc(post.id).set(post);
      await queuePublishedPostMail(post, { email: 'reviewer@politeia.ar' });
    }

    const firstRunAt = new Date(Date.now() + 10000);
    const result = await dispatchMailing({ now: firstRunAt });
    assert.equal(result.sent.length, 2);
    assert.equal(result.queuedForDigest.length, 1);

    const jobs = await firestore.collection('postMailingJobs').get();
    const statuses = jobs.docs.map((doc) => doc.data().status).sort();
    assert.deepEqual(statuses, ['digest_pending', 'sent', 'sent']);

    const tooSoon = await dispatchMailing({ now: new Date(firstRunAt.getTime() + 60 * 60 * 1000) });
    assert.equal(tooSoon.skipped, true);
    assert.equal(tooSoon.reason, 'interval');

    const overview = await getMailingAdminOverview();
    assert.equal(overview.settings.dispatchIntervalHours, 12);
    assert.equal(overview.settings.timeZone, 'UTC');
    assert.equal(overview.settings.singlePreheader, 'Una nota para leer hoy.');
    assert.equal(overview.settings.digestPreheader, 'Las notas nuevas de esta semana.');
    assert.equal(overview.sentThisWeek, 2);
    assert.equal(overview.remainingThisWeek, 0);
    assert.equal(overview.recipientCount, 1);
    await assert.rejects(
      () => updateMailingSettings({ timeZone: 'Zona/Inexistente' }, 'admin@politeia.ar'),
      /zona horaria no es valida/i,
    );
  } finally {
    config.mailProvider = previousProvider;
    setFirestoreForTests(null);
  }
});

test('post mailing variables work in every configurable mail text', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);

  try {
    await updateMailingSettings({
      singleSubject: '{{count}} nota: {{title}}',
      singlePreheader: 'Abrir {{title}}',
      digestSubject: '{{count}} notas: {{title}}',
      digestPreheader: 'Hay {{count}} lecturas; empieza por {{title}}',
      digestIntro: 'Publicamos {{count}} notas. La primera es {{title}}.',
      ctaLabel: 'Leer {{title}}',
    }, 'admin@politeia.ar');

    const single = await renderMailingPreview({ mode: 'single' });
    assert.equal(single.subject, '1 nota: Una nueva mirada sobre la politica cotidiana');
    assert.equal(single.previewText, 'Abrir Una nueva mirada sobre la politica cotidiana');
    assert.match(single.html, />Leer Una nueva mirada sobre la politica cotidiana<\/a>/);

    const digest = await renderMailingPreview({ mode: 'stack' });
    assert.equal(digest.subject, '4 notas: Una nueva mirada sobre la politica cotidiana');
    assert.equal(digest.previewText, 'Hay 4 lecturas; empieza por Una nueva mirada sobre la politica cotidiana');
    assert.match(digest.html, /Publicamos 4 notas\. La primera es Una nueva mirada sobre la politica cotidiana\./);
    assert.match(digest.html, />Leer Nota de ejemplo 2<\/a>/);
  } finally {
    setFirestoreForTests(null);
  }
});

test('mailing uses a compact WebP cover thumbnail when one is available', async () => {
  const source = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 20, g: 110, b: 145 },
    },
  }).jpeg({ quality: 90 }).toBuffer();
  const thumbnail = await createMailThumbnail(source);
  const metadata = await sharp(thumbnail).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 270);

  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  try {
    await updateMailingSettings({ enabled: true, gracePeriodMinutes: 0 }, 'admin@politeia.ar');
    const post = {
      id: 'post-with-thumbnail',
      title: 'Nota con portada',
      slug: 'nota-con-portada',
      excerpt: 'Una lectura con imagen optimizada.',
      coverImage: 'https://example.com/original-cover.jpg',
      coverImageThumbnail: 'https://example.com/mail-cover.webp',
      status: 'published',
      publishedAt: new Date().toISOString(),
    };
    await firestore.collection('posts').doc(post.id).set(post);
    const job = await queuePublishedPostMail(post, { email: 'reviewer@politeia.ar' });
    const preview = await renderMailingPreview({ jobIds: [job.id] });
    assert.match(preview.html, /https:\/\/example\.com\/mail-cover\.webp/);
    assert.doesNotMatch(preview.html, /original-cover\.jpg/);
    assert.match(preview.html, /width="128" height="92"/);
  } finally {
    setFirestoreForTests(null);
  }
});

test('newsletter preview preserves links and images with email-safe brand styles', () => {
  const rendered = renderNewsletterPreview({
    subject: 'Resumen de Politeia',
    previewText: 'Las lecturas de esta semana.',
    content: '## Titulo editorial\n\n[Leer la nota](https://www.politeia.ar/blog/nota)\n\n![Portada](https://example.com/portada.jpg)',
  });

  assert.match(rendered.html, /font-family:'Fraunces',Georgia/);
  assert.match(rendered.html, /font-family:'Archivo','Helvetica Neue',Arial/);
  assert.match(rendered.html, /href="https:\/\/www\.politeia\.ar\/blog\/nota"/);
  assert.match(rendered.html, /target="_blank"/);
  assert.match(rendered.html, /src="https:\/\/example\.com\/portada\.jpg"/);
  assert.match(rendered.html, /alt="Portada"/);
  assert.match(rendered.html, /width:100%;max-width:100%;height:auto/);
  assert.doesNotMatch(rendered.html, /<script/i);
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
    assert.match(delivery.html, />darte de baja de todos los envios<\/a>/);
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
    assert.match(requestBody.html, />darte de baja de todos los envios<\/a>/);
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
    resendTopicNewsletterId: config.resendTopicNewsletterId,
    resendTopicNewPostsId: config.resendTopicNewPostsId,
  };
  const previousFetch = global.fetch;
  let requestBody;
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  config.resendSegmentId = 'segment-1';
  config.resendTopicId = 'topic-1';
  config.resendTopicNewsletterId = 'topic-1';
  config.resendTopicNewPostsId = '';
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
    resendTopicNewsletterId: config.resendTopicNewsletterId,
    resendTopicNewPostsId: config.resendTopicNewPostsId,
  };
  const previousFetch = global.fetch;
  const requests = [];
  config.mailProvider = 'resend';
  config.resendApiKey = 're_test';
  config.resendSegmentId = 'segment-1';
  config.resendTopicId = 'topic-1';
  config.resendTopicNewsletterId = 'topic-1';
  config.resendTopicNewPostsId = '';
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

test('profile claim matching respects accents and repeated spaces', () => {
  assert.equal(identityNameKey('  Ana   P\u00e9rez '), identityNameKey('ana p\u00e9rez'));
  assert.notEqual(identityNameKey('Ana P\u00e9rez'), identityNameKey('Ana Perez'));
});

test('managed profile claim transfers profile, roles and every non-deleted post', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const requester = { email: 'ana@politeia.ar', name: 'Ana Perez', roles: [] };
  const admin = { email: 'dev@politeia.ar', name: 'Admin', roles: ['admin'] };

  try {
    const managed = await createManagedAuthorProfile({
      firstName: 'Ana',
      lastName: 'P\u00e9rez',
      description: 'Perfil gestionado',
      focusArea: 'Politica publica',
      closingPhrase: 'Una frase breve',
      publicProfileEnabled: true,
    }, admin.email);
    await updateUserProfile(requester, {
      firstName: '  ANA ',
      lastName: ' P\u00e9rez ',
      description: 'Dato temporal',
      publicProfileEnabled: true,
    });
    await firestore.collection('users').doc(requester.email).set({
      email: requester.email,
      roles: ['newsletter'],
      active: true,
      deletedAt: null,
    });

    const posts = firestore.collection('posts');
    await posts.doc('published').set({ authorName: 'Ana P\u00e9rez', authorEmail: '', status: 'published', deletedAt: null });
    await posts.doc('edition').set({ authorName: 'ANA   P\u00e9rez', authorEmail: '', publicAuthorEmail: '', status: 'published-edition', deletedAt: null });
    await posts.doc('draft').set({ authorName: 'Ana P\u00e9rez', authorEmail: '', status: 'draft', deletedAt: null });
    await posts.doc('archived').set({ authorName: 'Ana P\u00e9rez', authorEmail: '', status: 'archived', deletedAt: null });
    await posts.doc('deleted').set({ authorName: 'Ana P\u00e9rez', authorEmail: '', status: 'draft', deletedAt: '2026-01-01T00:00:00.000Z' });

    const match = await getProfileClaimMatch(requester);
    assert.equal(match.candidate.id, managed.id);
    assert.equal(match.candidate.postCount, 4);

    const requested = await createProfileClaim(requester, { managedProfileId: managed.id });
    const duplicate = await createProfileClaim(requester, { managedProfileId: managed.id });
    assert.equal(duplicate.id, requested.id);
    assert.equal((await listMyProfileClaims(requester)).items.length, 1);

    const approved = await approveProfileClaim(requested.id, admin);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.transferredPostCount, 4);
    assert.deepEqual(await resolveAssignedRoles(requester.email), ['blog', 'newsletter']);

    const account = await getUserProfile(requester);
    assert.equal(account.description, 'Perfil gestionado');
    assert.equal(account.focusArea, 'Politica publica');
    assert.equal(account.closingPhrase, 'Una frase breve');
    assert.equal(account.publicProfileEnabled, true);
    assert.equal((await firestore.collection('userProfiles').doc(managed.id).get()).exists, false);

    for (const id of ['published', 'edition', 'draft', 'archived']) {
      const post = (await posts.doc(id).get()).data();
      assert.equal(post.authorEmail, requester.email);
      assert.equal(post.ownershipClaimId, requested.id);
    }
    assert.equal((await posts.doc('published').get()).data().publicAuthorEmail, requester.email);
    assert.equal((await posts.doc('edition').get()).data().publicAuthorEmail, requester.email);
    assert.equal((await posts.doc('draft').get()).data().publicAuthorEmail, undefined);
    assert.equal((await posts.doc('deleted').get()).data().authorEmail, '');
  } finally {
    setFirestoreForTests(null);
  }
});

test('blocked profile claim can only be requested again after release', async () => {
  const firestore = createMemoryFirestore();
  setFirestoreForTests(firestore);
  const requester = { email: 'sol@politeia.ar', name: 'Sol Diaz', roles: [] };
  const admin = { email: 'admin@gmail.com', name: 'Admin externo', roles: ['admin'] };

  try {
    const managed = await createManagedAuthorProfile({ firstName: 'Sol', lastName: 'D\u00edaz' }, 'dev@politeia.ar');
    await updateUserProfile(requester, { firstName: 'Sol', lastName: 'D\u00edaz' });
    const claim = await createProfileClaim(requester, { managedProfileId: managed.id });
    const blocked = await blockProfileClaim(claim.id, admin, { reason: 'Necesitamos validar identidad' });
    assert.equal(blocked.status, 'blocked');
    await assert.rejects(
      createProfileClaim(requester, { managedProfileId: managed.id }),
      /solicitud esta bloqueada/i
    );
    const released = await releaseProfileClaim(claim.id, admin);
    assert.equal(released.status, 'released');
    const requestedAgain = await createProfileClaim(requester, { managedProfileId: managed.id });
    assert.notEqual(requestedAgain.id, claim.id);
    assert.equal(requestedAgain.status, 'pending');
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
        delete(ref) {
          return ref.delete();
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
