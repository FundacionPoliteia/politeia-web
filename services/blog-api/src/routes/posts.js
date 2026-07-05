import { Router } from 'express';
import { requireAnyRole, requireAuth, requireRole } from '../auth.js';
import { HttpError } from '../errors.js';
import { buildExcerpt, markdownToSafeHtml } from '../utils/content.js';
import { isValidSlug } from '../utils/slug.js';
import { sanitizeCategory, sanitizeTags } from '../utils/taxonomy.js';
import {
  assertNonEmptyString,
  assertOptionalString,
  assertStringArray,
  assertHttpsUrl,
} from '../utils/validation.js';
import {
  createPostComment,
  deletePostComment,
  listPostComments,
  updatePostCommentStatus,
} from '../repositories/comments.js';
import {
  createPost,
  getPublishedPostBySlug,
  listManagePosts,
  listPublishedPosts,
  softDeletePost,
  transitionPost,
  updatePost,
} from '../repositories/posts.js';
import {
  notifyCommentCreated,
  notifyCommentStatusChanged,
  notifyPostPublished,
  notifyPostSubmittedForReview,
  safeNotify,
} from '../repositories/notifications.js';

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
      const post = await transitionPost(req.params.id, 'review', req.user, 'post.submitReview');
      await safeNotify(() => notifyPostSubmittedForReview(post, req.user));
      res.json({ item: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/publish', writeLimiter, requireAuth, requireRole('reviewer'), async (req, res, next) => {
    try {
      const post = await transitionPost(req.params.id, 'published', req.user, 'post.publish');
      await safeNotify(() => notifyPostPublished(post, req.user));
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
  assertOptionalString(body.coverImage, 'coverImage');
  assertOptionalString(body.category, 'category');
  assertOptionalString(body.authorName, 'authorName');
  assertOptionalString(body.authorEmail, 'authorEmail');
  assertStringArray(body.tags, 'tags');
  if (body.coverImage) assertHttpsUrl(body.coverImage, 'coverImage');
  if (body.slug && !canChooseSlug(user)) {
    throw new HttpError(403, 'Only admin or reviewer users can choose slug');
  }

  const slug = body.slug?.trim() || '';
  if (slug && !isValidSlug(slug)) throw new HttpError(400, 'slug is invalid');
  const contentHtml = markdownToSafeHtml(body.contentMarkdown);

  return {
    title: body.title.trim(),
    slug: slug || null,
    excerpt: buildExcerpt(body.contentMarkdown, body.excerpt),
    contentMarkdown: body.contentMarkdown,
    contentHtml,
    coverImage: body.coverImage || null,
    authorEmail: canManageAllPosts(user) ? body.authorEmail || user.email : user.email,
    authorName: body.authorName || user.name || user.email,
    category: sanitizeCategory(body.category),
    tags: sanitizeTags(body.tags),
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
  if (body.contentMarkdown !== undefined) {
    assertNonEmptyString(body.contentMarkdown, 'contentMarkdown');
    patch.contentMarkdown = body.contentMarkdown;
    patch.contentHtml = markdownToSafeHtml(body.contentMarkdown);
    if (body.excerpt === undefined) {
      patch.excerpt = buildExcerpt(body.contentMarkdown);
    }
  }
  if (body.excerpt !== undefined) {
    assertOptionalString(body.excerpt, 'excerpt');
    patch.excerpt = buildExcerpt(body.contentMarkdown || '', body.excerpt);
  }
  if (body.coverImage !== undefined) {
    if (body.coverImage) assertHttpsUrl(body.coverImage, 'coverImage');
    patch.coverImage = body.coverImage || null;
  }
  if (body.category !== undefined) {
    assertOptionalString(body.category, 'category');
    patch.category = sanitizeCategory(body.category);
  }
  if (body.tags !== undefined) {
    assertStringArray(body.tags, 'tags');
    patch.tags = sanitizeTags(body.tags);
  }
  if (body.authorName !== undefined) {
    assertOptionalString(body.authorName, 'authorName');
    patch.authorName = body.authorName || '';
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

function canChooseSlug(user) {
  const roles = user?.roles || [];
  return roles.includes('admin') || roles.includes('reviewer');
}

function canManageAllPosts(user) {
  return canChooseSlug(user);
}
