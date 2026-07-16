import crypto from 'node:crypto';
import { db, serializeDoc, serverTimestamp } from '../firestore.js';
import { HttpError } from '../errors.js';
import { writeAuditLog } from './audit.js';
import { buildExcerpt, markdownToSafeHtml } from '../utils/content.js';
import { getInternalProfileSummaryByEmail, resolveUserDisplayName } from './profiles.js';

const comments = () => db().collection('reviewComments');
const commentLocks = () => db().collection('reviewCommentLocks');
const posts = () => db().collection('posts');

export async function listPostComments(postId, user) {
  await assertCanAccessPostComments(postId, user);
  const snapshot = await comments()
    .where('postId', '==', postId)
    .get();

  const items = snapshot.docs
    .map(serializeDoc)
    .filter((comment) => comment && !comment.deletedAt)
    .sort((a, b) => compareIsoDate(a.createdAt, b.createdAt));

  return { items: await enrichCommentAuthors(items) };
}

export async function createPostComment(postId, data, user) {
  const body = normalizeText(data.body);
  if (!body) throw new HttpError(400, 'body is required');
  const commentId = normalizeCommentId(data.commentId);
  if (!commentId) throw new HttpError(400, 'commentId is required');
  const contentMarkdown = normalizeMarkdown(data.contentMarkdown);
  if (!contentMarkdown) throw new HttpError(400, 'contentMarkdown is required');
  if (!hasReviewCommentAnchor(contentMarkdown, commentId)) {
    throw new HttpError(400, 'contentMarkdown must include the comment anchor');
  }
  if (hasNestedReviewCommentAnchor(contentMarkdown, commentId)) {
    throw new HttpError(400, 'No se puede comentar encima de otro comentario.');
  }

  const commentRef = comments().doc(commentId);
  const postRef = posts().doc(postId);
  const key = duplicateKey(postId, data.selectedText);
  const lockRef = commentLocks().doc(duplicateLockId(key));
  const authorName = await resolveUserDisplayName(user);
  const selectedText = normalizeText(data.selectedText).slice(0, 500);
  const comment = {
    postId,
    body,
    selectedText,
    selectedTextCurrent: selectedText,
    duplicateKey: key,
    status: 'open',
    authorEmail: user.email,
    authorName: authorName || user.name || user.email,
    replies: [],
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: '',
  };

  let beforePost = null;
  await db().runTransaction(async (transaction) => {
    const [postDoc, commentDoc, lockDoc] = await Promise.all([
      transaction.get(postRef),
      transaction.get(commentRef),
      transaction.get(lockRef),
    ]);
    if (commentDoc.exists) throw new HttpError(409, 'Comment already exists');
    if (!postDoc.exists) throw new HttpError(404, 'Post not found');
    const post = serializeDoc(postDoc);
    if (post.deletedAt) throw new HttpError(404, 'Post not found');
    assertCanAccessPostCommentsData(post, user);
    beforePost = post;
    if (lockDoc?.exists && !serializeDoc(lockDoc)?.releasedAt) {
      throw new HttpError(409, 'Ya existe un comentario abierto igual para esa seleccion.');
    }

    transaction.set(lockRef, {
      postId,
      duplicateKey: comment.duplicateKey,
      commentId,
      createdAt: serverTimestamp(),
      releasedAt: null,
    });
    transaction.set(commentRef, comment);
    transaction.update(postRef, {
      contentMarkdown,
      contentHtml: markdownToSafeHtml(contentMarkdown),
      excerpt: buildExcerpt(contentMarkdown),
      updatedAt: serverTimestamp(),
    });
  });

  const created = serializeDoc(await commentRef.get());
  const updatedPost = serializeDoc(await postRef.get());
  await writeAuditLog({
    actorEmail: user.email,
    action: 'comment.create',
    resourceType: 'reviewComment',
    resourceId: commentRef.id,
    after: created,
  });
  await writeAuditLog({
    actorEmail: user.email,
    action: 'post.commentAnchor.create',
    resourceType: 'post',
    resourceId: postId,
    before: beforePost,
    after: updatedPost,
  });

  const [enrichedComment] = await enrichCommentAuthors([created]);
  return { comment: enrichedComment, post: updatedPost };
}

export async function updatePostCommentStatus(postId, commentId, data, user) {
  const status = typeof data === 'string' ? data : data?.status;
  const hasStatusPatch = status !== undefined;
  if (hasStatusPatch && !['open', 'resolved'].includes(status)) throw new HttpError(400, 'status is invalid');
  const hasBodyPatch = typeof data?.body === 'string';
  const nextBody = hasBodyPatch ? normalizeText(data.body) : '';
  if (hasBodyPatch && !nextBody) throw new HttpError(400, 'body is required');
  const rawReplyBody = typeof data?.replyBody === 'string'
    ? data.replyBody
    : typeof data?.reply === 'string'
      ? data.reply
      : typeof data?.responseBody === 'string'
        ? data.responseBody
        : undefined;
  const hasReplyPatch = typeof rawReplyBody === 'string';
  const replyBody = hasReplyPatch ? normalizeText(rawReplyBody) : '';
  if (hasReplyPatch && !replyBody) throw new HttpError(400, 'replyBody is required');
  const selectedTextCurrent = normalizeText(data?.selectedTextCurrent).slice(0, 500);
  if (!hasStatusPatch && !hasBodyPatch && !hasReplyPatch && !selectedTextCurrent) {
    throw new HttpError(400, 'status, body or replyBody is required');
  }
  const contentMarkdown = normalizeMarkdown(data?.contentMarkdown);
  if (status === 'resolved') {
    if (!contentMarkdown) throw new HttpError(400, 'contentMarkdown is required');
    if (hasReviewCommentAnchor(contentMarkdown, commentId)) {
      throw new HttpError(400, 'contentMarkdown must remove the comment anchor');
    }
  }

  const ref = comments().doc(commentId);
  const patch = { updatedAt: serverTimestamp() };
  const replyAuthorName = hasReplyPatch ? await resolveUserDisplayName(user) : '';
  if (hasStatusPatch) {
    patch.status = status;
    patch.resolvedAt = status === 'resolved' ? serverTimestamp() : null;
    patch.resolvedBy = status === 'resolved' ? user.email : '';
  }
  if (selectedTextCurrent) {
    patch.selectedTextCurrent = selectedTextCurrent;
  }

  let before = null;
  let beforePost = null;
  await db().runTransaction(async (transaction) => {
    const postRef = posts().doc(postId);
    const [postDoc, beforeDoc] = await Promise.all([
      transaction.get(postRef),
      transaction.get(ref),
    ]);
    if (!postDoc.exists) throw new HttpError(404, 'Post not found');
    const post = serializeDoc(postDoc);
    if (post.deletedAt) throw new HttpError(404, 'Post not found');
    assertCanAccessPostCommentsData(post, user);
    beforePost = post;

    if (!beforeDoc.exists) throw new HttpError(404, 'Comment not found');
    before = serializeDoc(beforeDoc);
    if (before.deletedAt || before.postId !== postId) throw new HttpError(404, 'Comment not found');
    if (hasBodyPatch && !canReviewAll(user)) throw new HttpError(403, 'Only reviewer users can edit comments');
    if (hasBodyPatch && before.status === 'resolved') throw new HttpError(400, 'Resolved comments cannot be edited');

    if (hasBodyPatch) {
      patch.body = nextBody;
      patch.duplicateKey = duplicateKey(postId, before.selectedText);
    }
    if (hasReplyPatch) {
      patch.replies = [
        ...normalizeReplies(before.replies),
        buildCommentReply({
          body: replyBody,
          user,
          authorName: replyAuthorName,
          action: hasStatusPatch ? status : 'reply',
          selectedText: selectedTextCurrent || before.selectedTextCurrent || before.selectedText || '',
        }),
      ];
    }

    const finalStatus = hasStatusPatch ? status : before.status;
    const oldDuplicateKey = before.duplicateKey || '';
    const newDuplicateKey = patch.duplicateKey || oldDuplicateKey;

    if (hasBodyPatch && newDuplicateKey !== oldDuplicateKey) {
      const newLockRef = commentLocks().doc(duplicateLockId(newDuplicateKey));
      const newLockDoc = await transaction.get(newLockRef);
      if (newLockDoc.exists && !serializeDoc(newLockDoc)?.releasedAt) {
        throw new HttpError(409, 'Ya existe un comentario abierto igual para esa seleccion.');
      }
      if (oldDuplicateKey) {
        transaction.set(commentLocks().doc(duplicateLockId(oldDuplicateKey)), {
          postId,
          duplicateKey: oldDuplicateKey,
          commentId,
          releasedAt: serverTimestamp(),
          releasedBy: user.email,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      transaction.set(newLockRef, {
        postId,
        duplicateKey: newDuplicateKey,
        commentId,
        createdAt: serverTimestamp(),
        releasedAt: null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } else if (before.duplicateKey && hasStatusPatch) {
      transaction.set(commentLocks().doc(duplicateLockId(before.duplicateKey)), {
        postId,
        duplicateKey: before.duplicateKey,
        commentId,
        releasedAt: finalStatus === 'resolved' ? serverTimestamp() : null,
        releasedBy: finalStatus === 'resolved' ? user.email : '',
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    transaction.update(ref, patch);
    if (status === 'resolved') {
      transaction.update(postRef, {
        contentMarkdown,
        contentHtml: markdownToSafeHtml(contentMarkdown),
        excerpt: buildExcerpt(contentMarkdown),
        updatedAt: serverTimestamp(),
      });
    }
  });

  const after = serializeDoc(await ref.get());
  const afterPost = serializeDoc(await posts().doc(postId).get());
  await writeAuditLog({
    actorEmail: user.email,
    action: hasStatusPatch ? (status === 'resolved' ? 'comment.resolve' : 'comment.reopen') : 'comment.reply',
    resourceType: 'reviewComment',
    resourceId: commentId,
    before,
    after,
  });
  if (status === 'resolved') {
    await writeAuditLog({
      actorEmail: user.email,
      action: 'post.commentAnchor.resolve',
      resourceType: 'post',
      resourceId: postId,
      before: beforePost,
      after: afterPost,
    });
  }

  const [comment] = await enrichCommentAuthors([after]);
  return { comment, post: afterPost };
}

async function enrichCommentAuthors(items = []) {
  const emails = new Set();
  for (const item of items) {
    const itemEmail = normalizeEmail(item?.authorEmail);
    if (itemEmail) emails.add(itemEmail);
    for (const reply of normalizeReplies(item?.replies)) {
      const replyEmail = normalizeEmail(reply?.authorEmail);
      if (replyEmail) emails.add(replyEmail);
    }
  }

  const pairs = await Promise.all(Array.from(emails).map(async (email) => {
    try {
      return [email, await getInternalProfileSummaryByEmail(email)];
    } catch (_err) {
      return [email, null];
    }
  }));
  const profiles = new Map(pairs.filter(([, profile]) => profile));

  return items.map((item) => {
    const profile = profiles.get(normalizeEmail(item?.authorEmail));
    return {
      ...item,
      authorName: item?.authorName || profile?.fullName || item?.authorEmail || '',
      authorPhotoUrl: item?.authorPhotoUrl || profile?.photoUrl || '',
      replies: normalizeReplies(item?.replies).map((reply) => {
        const replyProfile = profiles.get(normalizeEmail(reply?.authorEmail));
        return {
          ...reply,
          authorName: reply.authorName || replyProfile?.fullName || reply.authorEmail || '',
          authorPhotoUrl: reply.authorPhotoUrl || replyProfile?.photoUrl || '',
        };
      }),
    };
  });
}

function buildCommentReply({ body, user, authorName, action = 'reply', selectedText = '' }) {
  return {
    id: `reply-${crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')}`,
    body,
    action,
    selectedText: normalizeText(selectedText).slice(0, 500),
    authorEmail: user.email,
    authorName: authorName || user.name || user.email,
    createdAt: new Date().toISOString(),
  };
}

function normalizeReplies(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((reply) => reply && !reply.deletedAt)
    .map((reply) => ({
      id: normalizeText(reply.id) || `reply-${crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')}`,
      body: normalizeText(reply.body),
      action: normalizeText(reply.action) || 'reply',
      selectedText: normalizeText(reply.selectedText).slice(0, 500),
      authorEmail: normalizeEmail(reply.authorEmail),
      authorName: normalizeText(reply.authorName || reply.authorEmail),
      authorPhotoUrl: normalizeText(reply.authorPhotoUrl),
      createdAt: reply.createdAt || '',
    }))
    .filter((reply) => reply.body);
}

export async function deletePostComment(postId, commentId, data, user) {
  const contentMarkdown = normalizeMarkdown(data?.contentMarkdown);
  if (!contentMarkdown) throw new HttpError(400, 'contentMarkdown is required');
  if (hasReviewCommentAnchor(contentMarkdown, commentId)) {
    throw new HttpError(400, 'contentMarkdown must remove the comment anchor');
  }

  const ref = comments().doc(commentId);
  const patch = {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  let before = null;
  let beforePost = null;
  await db().runTransaction(async (transaction) => {
    const postRef = posts().doc(postId);
    const [postDoc, beforeDoc] = await Promise.all([
      transaction.get(postRef),
      transaction.get(ref),
    ]);
    if (!postDoc.exists) throw new HttpError(404, 'Post not found');
    const post = serializeDoc(postDoc);
    if (post.deletedAt) throw new HttpError(404, 'Post not found');
    assertCanAccessPostCommentsData(post, user);
    beforePost = post;

    if (!beforeDoc.exists) throw new HttpError(404, 'Comment not found');
    before = serializeDoc(beforeDoc);
    if (before.deletedAt || before.postId !== postId) throw new HttpError(404, 'Comment not found');

    transaction.update(ref, patch);
    if (before.duplicateKey) {
      transaction.set(commentLocks().doc(duplicateLockId(before.duplicateKey)), {
        postId,
        duplicateKey: before.duplicateKey,
        commentId,
        releasedAt: serverTimestamp(),
        releasedBy: user.email,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    transaction.update(postRef, {
      contentMarkdown,
      contentHtml: markdownToSafeHtml(contentMarkdown),
      excerpt: buildExcerpt(contentMarkdown),
      updatedAt: serverTimestamp(),
    });
  });

  const after = serializeDoc(await ref.get());
  const afterPost = serializeDoc(await posts().doc(postId).get());
  await writeAuditLog({
    actorEmail: user.email,
    action: 'comment.delete',
    resourceType: 'reviewComment',
    resourceId: commentId,
    before,
    after,
  });
  await writeAuditLog({
    actorEmail: user.email,
    action: 'post.commentAnchor.delete',
    resourceType: 'post',
    resourceId: postId,
    before: beforePost,
    after: afterPost,
  });

  return { comment: after, post: afterPost };
}

async function assertCanAccessPostComments(postId, user) {
  const doc = await posts().doc(postId).get();
  if (!doc.exists) throw new HttpError(404, 'Post not found');
  const post = serializeDoc(doc);
  if (post.deletedAt) throw new HttpError(404, 'Post not found');
  assertCanAccessPostCommentsData(post, user);
  return post;
}

function assertCanAccessPostCommentsData(post, user) {
  if (canReviewAll(user)) return post;
  if (normalizeEmail(post.authorEmail) === normalizeEmail(user?.email)) return post;
  throw new HttpError(404, 'Post not found');
}

function canReviewAll(user) {
  const roles = user?.roles || [];
  return roles.includes('admin') || roles.includes('reviewer');
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMarkdown(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function duplicateKey(postId, selectedText) {
  return [
    normalizeText(postId),
    normalizeComparableText(selectedText).slice(0, 300),
  ].join('|');
}

function duplicateLockId(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeCommentId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9_-]{12,80}$/.test(id) ? id : '';
}

function hasReviewCommentAnchor(markdown, commentId) {
  const escapedId = escapeRegExp(commentId);
  const pattern = new RegExp(`<span\\b[^>]*data-review-comment-id=["']${escapedId}["'][^>]*>[\\s\\S]+?<\\/span>`, 'i');
  return pattern.test(markdown);
}

function hasNestedReviewCommentAnchor(markdown, commentId) {
  const escapedId = escapeRegExp(commentId);
  const pattern = new RegExp(`<span\\b[^>]*data-review-comment-id=["']${escapedId}["'][^>]*>([\\s\\S]+?)<\\/span>`, 'i');
  const match = markdown.match(pattern);
  return Boolean(match?.[1]?.match(/data-review-comment-id=["'][^"']+["']/i));
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function compareIsoDate(left, right) {
  const leftTime = Date.parse(left || '') || 0;
  const rightTime = Date.parse(right || '') || 0;
  return leftTime - rightTime;
}
