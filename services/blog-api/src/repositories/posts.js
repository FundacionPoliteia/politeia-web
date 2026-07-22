import { db, serializeDoc, serverTimestamp, Timestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';
import { createCategory } from './categories.js';
import { buildGeneratedSlug } from '../utils/slug.js';

const posts = () => db().collection('posts');
const PUBLIC_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'contentMarkdown',
  'contentHtml',
  'coverImage',
  'coverImageThumbnail',
  'showCoverInPost',
  'authorName',
  'authorEmail',
  'authorNote',
  'showAuthorNote',
  'category',
  'tags',
];
const PUBLIC_STATUSES = ['published', 'published-edition'];

export async function listPublishedPosts({ limit = 20, cursor = '' }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  let query = posts()
    .orderBy('publishedAt', 'desc')
    .limit((safeLimit + 1) * 4);

  if (cursor) query = query.startAfter(Timestamp.fromDate(new Date(cursor)));

  const snapshot = await query.get();
  const publicDocs = snapshot.docs
    .map(serializeDoc)
    .filter((post) => !post.deletedAt && PUBLIC_STATUSES.includes(post.status))
    .slice(0, safeLimit + 1);
  const docs = publicDocs.slice(0, safeLimit).map(toPublicPost);
  const nextCursor = publicDocs.length > safeLimit
    ? publicDocs[safeLimit - 1].publishedAt
    : null;

  return { items: docs, nextCursor };
}

export async function listManagePosts({ limit = 30, status = '', user }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const managesAllPosts = canManageAllPosts(user);
  const snapshot = await posts()
    .orderBy('updatedAt', 'desc')
    .limit(safeLimit * 4)
    .get();
  let items = snapshot.docs.map(serializeDoc).filter((post) => !post.deletedAt);

  if (!managesAllPosts) {
    items = items.filter((post) => normalizeEmail(post.authorEmail) === normalizeEmail(user?.email));
  }

  if (status) {
    items = items.filter((post) => matchesManageStatus(post, status, managesAllPosts));
  }

  if (!managesAllPosts) {
    items = items.map(toBlogAuthorView);
  }

  return { items: items.slice(0, safeLimit), nextCursor: null };
}

export async function getPublishedPostBySlug(slug) {
  const post = await findPublicPostBySlugField('slug', slug)
    || await findPublicPostBySlugField('publicSlug', slug);
  return post ? toPublicPost(post) : null;
}

async function findPublicPostBySlugField(field, slug) {
  const snapshot = await posts()
    .where(field, '==', slug)
    .limit(10)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs.map(serializeDoc).find((item) => !item.deletedAt && PUBLIC_STATUSES.includes(item.status)) || null;
}

export async function ensureSlugAvailable(slug, exceptId = '') {
  const snapshot = await posts().where('slug', '==', slug).limit(1).get();
  if (!snapshot.empty && snapshot.docs[0].id !== exceptId) {
    throw new HttpError(409, 'Slug already exists');
  }
}

export async function createPost(data, actorEmail) {
  const ref = posts().doc();
  if (!data.slug) {
    data.slug = buildGeneratedSlug(data.title, ref.id);
  }
  await ensureSlugAvailable(data.slug);
  if (data.category) await createCategory(data.category, actorEmail);
  await ref.set({
    ...data,
    status: 'draft',
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: null,
  });
  const created = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail,
    action: 'post.create',
    resourceType: 'post',
    resourceId: ref.id,
    after: created,
  });
  return created;
}

export async function updatePost(id, data, actorUser) {
  const ref = posts().doc(id);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Post not found');
  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'Post not found');
  assertCanAccessPost(before, actorUser);
  assertCanEditPost(before, actorUser);
  if (data.slug) await ensureSlugAvailable(data.slug, id);
  if (data.category) await createCategory(data.category, actorUser.email);

  await ref.update({ ...data, updatedAt: serverTimestamp() });
  const after = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail: actorUser.email,
    action: 'post.update',
    resourceType: 'post',
    resourceId: id,
    before,
    after,
  });
  return after;
}

export async function transitionPost(id, status, actorUser, action) {
  const ref = posts().doc(id);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Post not found');
  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'Post not found');
  assertCanAccessPost(before, actorUser);
  if (!canManageAllPosts(actorUser) && status === 'review' && !['draft', 'published-edition'].includes(before.status)) {
    throw new HttpError(403, 'Solicita edicion para modificar un post publicado');
  }

  const patch = {
    status: before.status === 'published-edition' && status === 'review' ? 'published-edition' : status,
    updatedAt: serverTimestamp(),
    editRequestedAt: null,
    editRequestedBy: '',
  };
  if (before.status === 'published-edition' && status === 'review') {
    patch.editionSubmittedAt = serverTimestamp();
    patch.editionSubmittedBy = actorUser.email;
  }
  if (status === 'published') {
    patch.publishedAt = serverTimestamp();
    patch.editionSubmittedAt = null;
    patch.editionSubmittedBy = '';
    Object.assign(patch, buildPublicSnapshot(before));
  }
  if (status === 'draft') patch.publishedAt = null;
  await ref.update(patch);

  const after = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail: actorUser.email,
    action,
    resourceType: 'post',
    resourceId: id,
    before,
    after,
  });
  return after;
}

export async function requestPostEdit(id, actorUser) {
  const ref = posts().doc(id);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Post not found');
  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'Post not found');
  assertPostOwner(before, actorUser);
  if (!['published', 'published-edition', 'archived'].includes(before.status)) {
    throw new HttpError(400, 'Solo se puede solicitar edicion sobre posts publicados');
  }

  await ref.update({
    editRequestedAt: serverTimestamp(),
    editRequestedBy: actorUser.email,
    updatedAt: serverTimestamp(),
  });

  const after = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail: actorUser.email,
    action: 'post.requestEdit',
    resourceType: 'post',
    resourceId: id,
    before,
    after,
  });
  return after;
}

export async function enablePostEditing(id, actorUser) {
  const ref = posts().doc(id);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Post not found');
  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'Post not found');
  if (!canManageAllPosts(actorUser)) throw new HttpError(403, 'Only reviewer users can enable editing');

  await ref.update({
    status: before.status === 'published' ? 'published-edition' : before.status,
    editRequestedAt: null,
    editRequestedBy: '',
    editionSubmittedAt: null,
    editionSubmittedBy: '',
    updatedAt: serverTimestamp(),
    ...(before.status === 'published' || !before.publicSlug ? buildPublicSnapshot(before) : {}),
  });

  const after = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail: actorUser.email,
    action: 'post.enableEdit',
    resourceType: 'post',
    resourceId: id,
    before,
    after,
  });
  return after;
}

export function canManageAllPosts(user) {
  const roles = user?.roles || [];
  return roles.includes('admin') || roles.includes('reviewer');
}

export function toBlogAuthorView(post) {
  if (!post) return post;
  return {
    ...post,
    status: post.status === 'archived' ? 'published' : post.status,
  };
}

export function matchesManageStatus(post, status, managesAllPosts) {
  if (managesAllPosts) {
    if (status === 'review') return post.status === 'review' || (post.status === 'published-edition' && Boolean(post.editionSubmittedAt));
    if (status === 'published') return post.status === 'published' || post.status === 'published-edition';
    return post.status === status;
  }
  if (status === 'published' || status === 'archived') {
    return post.status === 'published' || post.status === 'published-edition' || post.status === 'archived';
  }
  if (status === 'review') {
    return post.status === 'review' || (post.status === 'published-edition' && Boolean(post.editionSubmittedAt));
  }
  return post.status === status;
}

function assertCanAccessPost(post, user) {
  if (canManageAllPosts(user)) return;
  if (isPostOwner(post, user)) return;
  throw new HttpError(404, 'Post not found');
}

function assertCanEditPost(post, user) {
  if (canManageAllPosts(user)) return;
  if (['published', 'archived'].includes(post.status)) {
    throw new HttpError(403, 'Solicita edicion para modificar un post publicado');
  }
}

function buildPublicSnapshot(post = {}) {
  return Object.fromEntries(
    PUBLIC_FIELDS.map((field) => [`public${field.charAt(0).toUpperCase()}${field.slice(1)}`, post[field] ?? null])
  );
}

function toPublicPost(post = {}) {
  if (post.status !== 'published-edition') return post;
  const next = { ...post, status: 'published' };
  for (const field of PUBLIC_FIELDS) {
    const key = `public${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    if (post[key] !== undefined && post[key] !== null) next[field] = post[key];
  }
  return next;
}

function assertPostOwner(post, user) {
  if (isPostOwner(post, user)) return;
  throw new HttpError(404, 'Post not found');
}

function isPostOwner(post, user) {
  return normalizeEmail(post.authorEmail) === normalizeEmail(user?.email);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export async function softDeletePost(id, actorEmail) {
  const ref = posts().doc(id);
  const beforeDoc = await ref.get();
  if (!beforeDoc.exists) throw new HttpError(404, 'Post not found');
  const before = serializeDoc(beforeDoc);
  if (before.deletedAt) throw new HttpError(404, 'Post not found');

  await ref.update({
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const after = serializeDoc(await ref.get());
  await writeAuditLog({
    actorEmail,
    action: 'post.delete',
    resourceType: 'post',
    resourceId: id,
    before,
    after,
  });
  return after;
}
