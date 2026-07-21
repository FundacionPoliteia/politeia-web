import { config } from '../config.js';

export const MAIL_CHANNELS = {
  internal: 'internal',
  updates: 'updates',
  newsletter: 'newsletter',
};

export async function sendMail({
  channel = MAIL_CHANNELS.internal,
  to,
  subject,
  text = '',
  html = '',
  replyTo = '',
  headers = {},
  idempotencyKey = '',
}) {
  const from = channelSender(channel);
  if (config.mailProvider === 'disabled') {
    return { ok: true, status: 'skipped', providerMessageId: 'disabled' };
  }

  if (config.mailProvider === 'console') {
    console.info(JSON.stringify({
      severity: 'INFO',
      message: 'mail delivery',
      provider: config.mailProvider,
      projectKey: config.mailProjectKey,
      channel,
      from,
      to,
      subject,
      text,
      html: html ? '[html]' : '',
      idempotencyKey,
    }));
    return { ok: true, status: 'logged', providerMessageId: `console-${Date.now()}` };
  }

  if (config.mailProvider !== 'resend') {
    return { ok: false, error: `Unknown MAIL_PROVIDER: ${config.mailProvider}` };
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (text) payload.text = text;
  if (html) payload.html = html;
  const effectiveReplyTo = replyTo || config.mailReplyTo;
  if (effectiveReplyTo) payload.reply_to = effectiveReplyTo;
  if (Object.keys(headers).length) payload.headers = headers;

  const result = await resendRequest('/emails', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
  return result.ok
    ? { ok: true, status: 'sent', providerMessageId: result.data?.id || '' }
    : result;
}

export async function syncResendContact({ email, firstName = '', lastName = '', subscribed = true, topics = null }) {
  if (config.mailProvider !== 'resend') return { ok: true, status: 'skipped' };
  const topicSubscriptions = buildTopicSubscriptions(topics, subscribed);
  if (!config.resendSegmentId && topicSubscriptions.length === 0) {
    return { ok: true, status: 'skipped', warning: 'No Resend segment or topic configured' };
  }

  const payload = {
    email,
    unsubscribed: !subscribed,
  };
  if (firstName) payload.first_name = firstName;
  if (lastName) payload.last_name = lastName;
  if (config.resendSegmentId) payload.segments = [{ id: config.resendSegmentId }];
  if (topicSubscriptions.length) payload.topics = topicSubscriptions;

  const created = await resendRequest('/contacts', { method: 'POST', body: payload });
  if (created.ok) return created;

  // A contact email is unique in Resend. If it already exists, update the
  // global status first and synchronize segment/topic membership separately.
  const updated = await resendRequest(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: { unsubscribed: !subscribed },
  });
  if (!updated.ok) {
    return providerSyncError('contact', updated, created);
  }

  if (config.resendSegmentId) {
    const segment = await resendRequest(
      `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(config.resendSegmentId)}`,
      { method: 'POST' },
    );
    // Resend can report an existing membership as a conflict. The desired
    // state is already satisfied in that case.
    if (!segment.ok && segment.statusCode !== 409) {
      return providerSyncError('segment', segment);
    }
  }

  if (topicSubscriptions.length) {
    const topics = await resendRequest(`/contacts/${encodeURIComponent(email)}/topics`, {
      method: 'PATCH',
      body: topicSubscriptions,
    });
    if (!topics.ok) return providerSyncError('topic', topics);
  }

  return {
    ok: true,
    status: 'updated',
    data: updated.data,
    providerMessageId: updated.providerMessageId || updated.data?.id || '',
  };
}

export async function createResendBroadcast({
  name,
  subject,
  html,
  text = '',
  previewText = '',
  send = false,
  topicId = config.resendTopicNewsletterId,
  scheduledAt = '',
  idempotencyKey = '',
}) {
  if (config.mailProvider === 'console') {
    console.info(JSON.stringify({
      severity: 'INFO',
      message: 'newsletter broadcast',
      provider: 'console',
      projectKey: config.mailProjectKey,
      segmentId: config.resendSegmentId || 'console-segment',
      name,
      subject,
      send,
    }));
    return { ok: true, status: send ? 'sent' : 'draft', providerMessageId: `console-broadcast-${Date.now()}` };
  }
  if (config.mailProvider === 'disabled') {
    return { ok: true, status: 'skipped', providerMessageId: 'disabled' };
  }
  if (config.mailProvider !== 'resend') {
    return { ok: false, error: `Unknown MAIL_PROVIDER: ${config.mailProvider}` };
  }
  if (!config.resendSegmentId) {
    return { ok: false, error: 'Missing RESEND_SEGMENT_ID for newsletter broadcasts' };
  }

  const body = {
    segment_id: config.resendSegmentId,
    from: channelSender(MAIL_CHANNELS.newsletter),
    name,
    subject,
    html,
    text,
    send,
  };
  if (previewText) body.preview_text = previewText;
  if (scheduledAt) body.scheduled_at = scheduledAt;
  if (config.mailReplyTo) body.reply_to = config.mailReplyTo;
  if (topicId) body.topic_id = topicId;
  return resendRequest('/broadcasts', { method: 'POST', body, idempotencyKey });
}

export async function sendResendBroadcast(providerBroadcastId, { scheduledAt = '', idempotencyKey = '' } = {}) {
  const id = String(providerBroadcastId || '').trim();
  if (!id) return { ok: false, error: 'provider broadcast id is required' };
  if (config.mailProvider === 'console') return { ok: true, status: 'sent', providerMessageId: id };
  if (config.mailProvider === 'disabled') return { ok: true, status: 'skipped', providerMessageId: id };
  const body = scheduledAt ? { scheduled_at: scheduledAt } : {};
  return resendRequest(`/broadcasts/${encodeURIComponent(id)}/send`, { method: 'POST', body, idempotencyKey });
}

export async function getResendBroadcast(providerBroadcastId) {
  const id = String(providerBroadcastId || '').trim();
  if (!id) return { ok: false, error: 'provider broadcast id is required' };
  if (config.mailProvider === 'console') return { ok: true, status: 'sent', data: { id, status: 'sent' } };
  if (config.mailProvider === 'disabled') return { ok: true, status: 'skipped', data: { id, status: 'skipped' } };
  return resendRequest(`/broadcasts/${encodeURIComponent(id)}`);
}

export function channelSender(channel) {
  if (channel === MAIL_CHANNELS.newsletter) return config.mailFromNewsletter;
  if (channel === MAIL_CHANNELS.updates) return config.mailFromUpdates;
  return config.mailFromInternal;
}

async function resendRequest(path, { method = 'GET', body, idempotencyKey = '' } = {}) {
  if (!config.resendApiKey) {
    return { ok: false, error: 'Missing RESEND_API_KEY for MAIL_PROVIDER=resend' };
  }
  const headers = {
    Authorization: `Bearer ${config.resendApiKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 256);

  try {
    const response = await fetch(`https://api.resend.com${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: data?.message || data?.error || `Resend returned ${response.status}`, statusCode: response.status };
    }
    return { ok: true, data, status: 'ok', providerMessageId: data?.id || '' };
  } catch (err) {
    return { ok: false, error: err?.message || 'Resend request failed' };
  }
}

function providerSyncError(stage, result, previous = null) {
  console.error(JSON.stringify({
    severity: 'ERROR',
    message: 'Resend contact synchronization failed',
    stage,
    statusCode: result?.statusCode || 0,
    providerError: result?.error || 'Unknown provider error',
    previousStatusCode: previous?.statusCode || 0,
    previousProviderError: previous?.error || '',
  }));
  return {
    ok: false,
    error: `Resend contact synchronization failed at ${stage}: ${result?.error || 'Unknown provider error'}`,
    statusCode: result?.statusCode || 0,
  };
}

function buildTopicSubscriptions(topics, subscribed) {
  const values = topics && typeof topics === 'object'
    ? [
        [config.resendTopicNewsletterId, topics.newsletter !== false],
        [config.resendTopicNewPostsId, topics.newPosts !== false],
      ]
    : [[config.resendTopicNewsletterId || config.resendTopicId, subscribed]];
  const seen = new Set();
  return values
    .filter(([id]) => id && !seen.has(id) && seen.add(id))
    .map(([id, enabled]) => ({ id, subscription: subscribed && enabled ? 'opt_in' : 'opt_out' }));
}
