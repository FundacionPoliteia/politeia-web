import { Router } from 'express';
import { requireAnyRole, requireAuth, requireRole } from '../auth.js';
import { HttpError } from '../errors.js';
import {
  buildExcerpt,
  markdownToSafeHtml,
  normalizeExcerptMode,
  sanitizeReferences,
} from '../utils/content.js';
import { isValidSlug } from '../utils/slug.js';
import { sanitizeCategory, sanitizeTags } from '../utils/taxonomy.js';
import {
  assertNonEmptyString,
  assertOptionalString,
  assertStringArray,
  assertHttpsUrl,
  assertOptionalBoolean,
  assertExcerptMode,
  assertReferences,
} from '../utils/validation.js';
import {
  createPostComment,
  deletePostComment,
  listPostComments,
  updatePostCommentStatus,
} from '../repositories/comments.js';
import {
  createPost,
  enablePostEditing,
  getPublishedPostBySlug,
  listManagePosts,
  listPublishedPosts,
  requestPostEdit,
  softDeletePost,
  transitionPost,
  updatePost,
} from '../repositories/posts.js';
import { getReviewAssignee } from '../repositories/profiles.js';
import { normalizeEmail } from '../repositories/users.js';
import {
  notifyCommentCreated,
  notifyCommentReplied,
  notifyCommentStatusChanged,
  notifyPostEditEnabled,
  notifyPostEditRequested,
  notifyPostPublished,
  notifyPostSubmittedForReview,
  safeNotify,
} from '../repositories/notifications.js';
import { queuePublishedPostMail } from '../repositories/mailingAutomation.js';

export function postsRouter({ writeLimiter }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const status = req.query.status || 'published';
      if (status !== 'published') throw new HttpError(400, 'Only published listing is public');
      const result = await listPublishedPosts({
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/manage', requireAuth, requireAnyRole(['blog', 'reviewer']), async (req, res, next) => {
    try {
      const result = await listManagePosts({
        limit: req.query.limit,
        status: req.query.status || '',
        user: req.user,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/comments', requireAuth, requireAnyRole(['blog', 'reviewer']), async (req, res, next) => {
    try {
      const result = await listPostComments(req.params.id, req.user);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/comments', writeLimiter, requireAuth, requireRole('reviewer'), async (req, res, next) => {
    try {
      const result = await createPostComment(req.params.id, req.body || {}, req.user);
      await safeNotify(() => notifyCommentCreated(result.post, result.comment, req.user));
      res.status(201).json({ item: result.comment, post: result.post });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/comments/:commentId', writeLimiter, requireAuth, requireAnyRole(['blog', 'reviewer']), async (req, res, next) => {
    try {
      const result = await updatePostCommentStatus(req.params.id, req.params.commentId, req.body || {}, req.user);
      if (req.body?.status) {
        await safeNotify(() => notifyCommentStatusChanged(result.post, result.comment, req.user, req.body.status));
      } else if (req.body?.replyBody || req.body?.reply || req.body?.responseBody) {
        await safeNotify(() => notifyCommentReplied(result.post, result.comment, req.user));
      }
      res.json({ item: result.comment, post: result.post });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/comments/:commentId', writeLimiter, requireAuth, requireRole('reviewer'), async (req, res, next) => {
    try {
      const result = await deletePostComment(req.params.id, req.params.commentId, req.body || {}, req.user);
      res.json({ item: result.comment, post: result.post });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:slug', async (req, res, next) => {
    try {
      const post = await getPublishedPostBySlug(req.params.slug);
      if (!post) throw new HttpError(404, 'Post not found');
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', writeLimiter, requireAuth, requireRole('blog'), async (req, res, next) => {
    try {
      const data = buildPostPayload(req.body, req.user);
      const post = await createPost(data, req.user.email);
      res.status(201).json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', writeLimiter, requireAuth, requireAnyRole(['blog', 'reviewer']), async (req, res, next) => {
    try {
      const data = buildPostPatch(req.body, req.user);
      const post = await updatePost(req.params.id, data, req.user);
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', writeLimiter, requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const post = await softDeletePost(req.params.id, req.user.email);
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/submit-review', writeLimiter, requireAuth, requireRole('blog'), async (req, res, next) => {
    try {
      const reviewerEmail = normalizeEmail(req.body?.reviewerEmail);
      if (reviewerEmail && reviewerEmail === normalizeEmail(req.user?.email)) {
        throw new HttpError(400, 'You cannot assign your own review');
      }
      const reviewAssignee = reviewerEmail ? await getReviewAssignee(reviewerEmail) : null;
      if (reviewerEmail && !reviewAssignee) {
        throw new HttpError(400, 'The selected reviewer is not available');
      }
      const post = await transitionPost(
        req.params.id,
        'review',
        req.user,
        'post.submitReview',
        { reviewAssignee }
      );
      await safeNotify(() => notifyPostSubmittedForReview(post, req.user));
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/request-edit', writeLimiter, requireAuth, requireRole('blog'), async (req, res, next) => {
    try {
      const post = await requestPostEdit(req.params.id, req.user);
      await safeNotify(() => notifyPostEditRequested(post, req.user));
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/enable-edit', writeLimiter, requireAuth, requireRole('reviewer'), async (req, res, next) => {
    try {
      const post = await enablePostEditing(req.params.id, req.user);
      await safeNotify(() => notifyPostEditEnabled(post, req.user));
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/publish', writeLimiter, requireAuth, requireRole('reviewer'), async (req, res, next) => {
    try {
      const post = await transitionPost(req.params.id, 'published', req.user, 'post.publish');
      await safeNotify(() => notifyPostPublished(post, req.user));
      await safeNotify(() => queuePublishedPostMail(post, req.user, {
        notifySubscribers: req.body?.notifySubscribers !== false,
      }));
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/archive', writeLimiter, requireAuth, requireRole('reviewer'), async (req, res, next) => {
    try {
      const post = await transitionPost(req.params.id, 'archived', req.user, 'post.archive');
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function buildPostPayload(body, user) {
  assertNonEmptyString(body.title, 'title');
  assertNonEmptyString(body.contentMarkdown, 'contentMarkdown');
  assertOptionalString(body.slug, 'slug');
  assertOptionalString(body.excerpt, 'excerpt');
  assertExcerptMode(body.excerptMode);
  assertReferences(body.references);
  assertOptionalString(body.coverImage, 'coverImage');
  assertOptionalString(body.coverImageThumbnail, 'coverImageThumbnail');
  assertOptionalString(body.category, 'category');
  assertOptionalString(body.authorName, 'authorName');
  assertOptionalString(body.authorNote, 'authorNote');
  assertOptionalString(body.authorEmail, 'authorEmail');
  assertOptionalString(body.publicationDate, 'publicationDate');
  assertOptionalBoolean(body.showCoverInPost, 'showCoverInPost');
  assertOptionalBoolean(body.showAuthorNote, 'showAuthorNote');
  assertStringArray(body.tags, 'tags');
  if (body.coverImage) assertHttpsUrl(body.coverImage, 'coverImage');
  if (body.coverImageThumbnail) assertHttpsUrl(body.coverImageThumbnail, 'coverImageThumbnail');
  if (body.slug && !canChooseSlug(user)) {
    throw new HttpError(403, 'Only admin or reviewer users can choose slug');
  }
  if (body.publicationDate !== undefined && !canChooseSlug(user)) {
    throw new HttpError(403, 'Only admin or reviewer users can choose publicationDate');
  }

  const slug = body.slug?.trim() || '';
  if (slug && !isValidSlug(slug)) throw new HttpError(400, 'slug is invalid');
  const publicationDate = normalizePublicationDate(body.publicationDate);
  const contentHtml = markdownToSafeHtml(body.contentMarkdown);
  const excerptMode = normalizeExcerptMode(body.excerptMode, {
    hasExcerpt: body.excerpt !== undefined,
  });

  return {
    title: body.title.trim(),
    slug: slug || null,
    excerptMode,
    excerpt: excerptMode === 'auto'
      ? buildExcerpt(body.contentMarkdown)
      : buildExcerpt('', body.excerpt || ''),
    contentMarkdown: body.contentMarkdown,
    contentHtml,
    coverImage: body.coverImage || null,
    coverImageThumbnail: body.coverImageThumbnail || null,
    showCoverInPost: body.showCoverInPost !== false,
    authorEmail: canManageAllPosts(user) ? body.authorEmail || user.email : user.email,
    authorName: body.authorName || user.name || user.email,
    authorNote: normalizeAuthorNote(body.authorNote),
    showAuthorNote: body.showAuthorNote === true,
    category: sanitizeCategory(body.category),
    tags: sanitizeTags(body.tags),
    references: sanitizeReferences(body.references),
    publicationDate: publicationDate || null,
  };
}

function buildPostPatch(body, user) {
  const patch = {};
  if (body.title !== undefined) {
    assertNonEmptyString(body.title, 'title');
    patch.title = body.title.trim();
  }
  if (body.slug !== undefined) {
    if (!canChooseSlug(user)) {
      throw new HttpError(403, 'Only admin or reviewer users can choose slug');
    }
    assertNonEmptyString(body.slug, 'slug');
    if (!isValidSlug(body.slug)) throw new HttpError(400, 'slug is invalid');
    patch.slug = body.slug;
  }
  if (body.publicationDate !== undefined) {
    if (!canChooseSlug(user)) {
      throw new HttpError(403, 'Only admin or reviewer users can choose publicationDate');
    }
    assertOptionalString(body.publicationDate, 'publicationDate');
    patch.publicationDate = normalizePublicationDate(body.publicationDate) || null;
  }
  if (body.contentMarkdown !== undefined) {
    assertNonEmptyString(body.contentMarkdown, 'contentMarkdown');
    patch.contentMarkdown = body.contentMarkdown;
    patch.contentHtml = markdownToSafeHtml(body.contentMarkdown);
  }
  if (body.excerptMode !== undefined) {
    assertExcerptMode(body.excerptMode);
    patch.excerptMode = body.excerptMode;
  }
  if (body.excerpt !== undefined) {
    assertOptionalString(body.excerpt, 'excerpt');
    if (body.excerptMode !== 'auto') {
      patch.excerpt = buildExcerpt('', body.excerpt);
      if (body.excerptMode === undefined) patch.excerptMode = 'manual';
    }
  }
  if (body.coverImage !== undefined) {
    if (body.coverImage) assertHttpsUrl(body.coverImage, 'coverImage');
    patch.coverImage = body.coverImage || null;
  }
  if (body.coverImageThumbnail !== undefined) {
    if (body.coverImageThumbnail) assertHttpsUrl(body.coverImageThumbnail, 'coverImageThumbnail');
    patch.coverImageThumbnail = body.coverImageThumbnail || null;
  }
  if (body.showCoverInPost !== undefined) {
    assertOptionalBoolean(body.showCoverInPost, 'showCoverInPost');
    patch.showCoverInPost = body.showCoverInPost !== false;
  }
  if (body.category !== undefined) {
    assertOptionalString(body.category, 'category');
    patch.category = sanitizeCategory(body.category);
  }
  if (body.tags !== undefined) {
    assertStringArray(body.tags, 'tags');
    patch.tags = sanitizeTags(body.tags);
  }
  if (body.references !== undefined) {
    assertReferences(body.references);
    patch.references = sanitizeReferences(body.references);
  }
  if (body.authorName !== undefined) {
    assertOptionalString(body.authorName, 'authorName');
    patch.authorName = body.authorName || '';
  }
  if (body.authorNote !== undefined) {
    assertOptionalString(body.authorNote, 'authorNote');
    patch.authorNote = normalizeAuthorNote(body.authorNote);
  }
  if (body.showAuthorNote !== undefined) {
    assertOptionalBoolean(body.showAuthorNote, 'showAuthorNote');
    patch.showAuthorNote = body.showAuthorNote === true;
  }
  if (body.authorEmail !== undefined) {
    if (!canManageAllPosts(user)) {
      throw new HttpError(403, 'Only admin or reviewer users can change authorEmail');
    }
    assertOptionalString(body.authorEmail, 'authorEmail');
    patch.authorEmail = body.authorEmail || '';
  }
  return patch;
}

function normalizeAuthorNote(value = '') {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 500) : '';
}

function normalizePublicationDate(value = '') {
  const cleanValue = typeof value === 'string' ? value.trim() : '';
  if (!cleanValue) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    throw new HttpError(400, 'publicationDate must use YYYY-MM-DD');
  }
  const date = new Date(`${cleanValue}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cleanValue) {
    throw new HttpError(400, 'publicationDate is invalid');
  }
  if (cleanValue > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'publicationDate cannot be in the future');
  }
  return cleanValue;
}

function canChooseSlug(user) {
  const roles = user?.roles || [];
  return roles.includes('admin') || roles.includes('reviewer');
}

function canManageAllPosts(user) {
  return canChooseSlug(user);
}
