import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { sendMail } from '../src/repositories/notifications.js';

test('console mail provider logs instead of sending real email', async () => {
  const previousProvider = config.mailProvider;
  config.mailProvider = 'console';

  try {
    const result = await sendMail({
      to: 'author@gmail.com',
      subject: 'Test',
      text: 'Body',
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'logged');
    assert.match(result.providerMessageId, /^console-/);
  } finally {
    config.mailProvider = previousProvider;
  }
});

test('resend provider fails clearly without api key', async () => {
  const previousProvider = config.mailProvider;
  const previousApiKey = config.resendApiKey;
  config.mailProvider = 'resend';
  config.resendApiKey = '';

  try {
    const result = await sendMail({
      to: 'author@gmail.com',
      subject: 'Test',
      text: 'Body',
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /RESEND_API_KEY/);
  } finally {
    config.mailProvider = previousProvider;
    config.resendApiKey = previousApiKey;
  }
});

test('resend provider sends through HTTP API', async () => {
  const previousProvider = config.mailProvider;
  const previousApiKey = config.resendApiKey;
  const previousFetch = globalThis.fetch;
  config.mailProvider = 'resend';
  config.resendApiKey = 'test-key';

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, ['author@gmail.com']);
    assert.equal(body.subject, 'Test');
    return {
      ok: true,
      json: async () => ({ id: 'email_123' }),
    };
  };

  try {
    const result = await sendMail({
      to: 'author@gmail.com',
      subject: 'Test',
      text: 'Body',
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'sent');
    assert.equal(result.providerMessageId, 'email_123');
  } finally {
    config.mailProvider = previousProvider;
    config.resendApiKey = previousApiKey;
    globalThis.fetch = previousFetch;
  }
});
